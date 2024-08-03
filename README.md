This is a tool to copy Nexus Artifacts from one repository to another. 

## Usage
````
npm install
npx ts-node index.ts -c sample.yml
````

## format of configuration

Please refer to [sample.yml](sample.yml)

logLevel: defining logging level, could be error, info, debug, etc.

source: URL of the Nexus server hosting source artifacts.

target: Target Nexus repository URL.

targetUsernameEnv: Nexus server username environment variable.

targetPasswordEnv: Nexus server password environment variable.

Artifacts:
  - sourceRepository: Source repository in Nexus
  - targetRepository: Target repository in Nexus
  - groupId: Unique identifier used in Maven
  - artifactId: Unique identifier for a software component within a specific project in Nexus