import { Command } from 'commander'
import * as fs from "node:fs"
import { parse } from 'yaml'
import * as log4js from 'log4js'

async function getArtifact(nexusServer: string, repository: string, groupId: string, artifactId: string) {
    const artifactUrl = `${nexusServer}/service/rest/v1/search?repository=${repository}&group=${groupId}&name=${artifactId}`
    let items: any[] = []
    let nextToken = undefined
    while (true) {
        let searchUrl = artifactUrl
        if (nextToken) {
            searchUrl = searchUrl + `&continuationToken=${nextToken}`
        }
        const response = await fetch(searchUrl);
        const data: any = await response.json()
        items = items.concat(data.items)
        if (data.continuationToken) {
            nextToken = data.continuationToken
        } else {
            break
        }
    }
    return items
}

async function getArtifactVersions(nexusServer: string, repository: string, groupId: string, artifactId: string) {
    const items = await getArtifact(nexusServer, repository, groupId, artifactId)
    const versions = []
    for (let item of items) {
        versions.push(item.version)
    }
    return versions;
}

async function copyArtifact(nexusConfig: NexusConfig, targetRepository: string, artifact: any) {
    const targetNexus = nexusConfig.target
    const form = new FormData()
    form.append('maven2.groupId', artifact.group)
    form.append('maven2.artifactId', artifact.name)
    form.append('maven2.version', artifact.version)
    form.append('maven2.generate-pom', 'false')
    let index = 1
    for (let asset of artifact.assets) {
        const filename = asset.downloadUrl.substring(asset.downloadUrl.lastIndexOf('/') + 1)
        const extension = filename.substring(filename.lastIndexOf('.') + 1)
        if ( filename.endsWith('.sha1') || filename.endsWith('.md5') || filename.endsWith('.sha256') || filename.endsWith('.sha512')) {
            logger.debug(`Skip ${filename}`)
            continue
        }
        logger.debug(`Uploading ${filename}`)
        const response = await fetch(asset.downloadUrl)
        const blob = await response.blob()
        form.append(`maven2.asset${index}`, blob, filename)
        form.append(`maven2.asset${index}.extension`, extension)
        if (asset.maven2.classifier) {
            form.append(`maven2.asset${index}.classifier`, asset.maven2.classifier)
        }
        index++
    }
    const response = await fetch(`${targetNexus}/service/rest/v1/components?repository=${targetRepository}`, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(`${process.env[nexusConfig.targetUsernameEnv]}:${process.env[nexusConfig.targetPasswordEnv]}`)
        },
        body: form
    });
    if ( response.status !== 204 ) {
        console.log(response)
        logger.error(`Failed to upload artifact ${artifact.group}:${artifact.name}:${artifact.version}`)
        throw new Error(response.statusText)
    }
}

async function migrateArtifacts(nexusConfig: NexusConfig) {
    const sourceNexus = nexusConfig.source
    const targetNexus = nexusConfig.target
    for (let artifact of nexusConfig.artifacts) {
        logger.info(`Load Versions from ${sourceNexus} for ${artifact.groupId}:${artifact.artifactId}`)
        const sourceArtifacts = await getArtifact(sourceNexus, artifact.sourceRepository, artifact.groupId, artifact.artifactId)
        logger.info(`Found ${sourceArtifacts.length} versions from source server`)

        logger.info(`Load Versions from ${targetNexus} for ${artifact.groupId}:${artifact.artifactId}`)
        const targetVersions = await getArtifactVersions(targetNexus, artifact.targetRepository, artifact.groupId, artifact.artifactId)
        logger.info(`Found ${targetVersions.length} versions from target server`)

        let cntOfMigratedVersions = 0
        for (let sourceArtifact of sourceArtifacts) {
            if ( targetVersions.includes(sourceArtifact.version) ) {
                logger.debug(`Artifact ${sourceArtifact.group}:${sourceArtifact.name}:${sourceArtifact.version} already exists in target server`)
                continue
            }
            logger.info(`Migrating ${sourceArtifact.group}:${sourceArtifact.name}:${sourceArtifact.version}`)
            await copyArtifact(nexusConfig, artifact.targetRepository, sourceArtifact)
            cntOfMigratedVersions++
        }
        logger.info(`Migrated ${cntOfMigratedVersions} versions for ${artifact.groupId}:${artifact.artifactId}\n`)
    }
}

interface Artifact {
    sourceRepository: string;
    targetRepository: string;
    groupId: string;
    artifactId: string;
}

interface NexusConfig {
    logLevel: string;
    source: string;
    target: string;
    targetUsernameEnv: string;
    targetPasswordEnv: string;
    artifacts: Artifact[];
}

const logger = log4js.getLogger()

const options = new Command()
    .requiredOption('-c, --config <char>', 'the configuration file')
    .parse()
    .opts()
const configurationFile = fs.readFileSync(options.config, 'utf8')
const configuration: NexusConfig = parse(configurationFile)
logger.level = configuration.logLevel
migrateArtifacts(configuration)