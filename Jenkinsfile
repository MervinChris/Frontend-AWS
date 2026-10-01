pipeline {
    agent any

    environment {
        // --- AWS / ECR ---
        AWS_REGION         = 'us-east-1'
        ECR_REPO           = 's3-mini-project-frontend'
        // Leave blank to use the AWS CLI config already present on the Jenkins machine,
        // or set it to a Jenkins "Username with password" credential holding the access key / secret.
        AWS_CREDENTIALS_ID = ''

        // --- EC2 target ---
        EC2_HOST           = 'ec2-44-192-94-178.compute-1.amazonaws.com'
        EC2_USER           = 'ubuntu'
        PEM_DIR            = 'C:\\Users\\Administrator\\Downloads'
        PEM_FILE           = 'testUbuntu.pem'

        // Path of the compose file that already lives on the instance.
        // Leave blank to let the job find it automatically under the remote user's home.
        REMOTE_COMPOSE_PATH = '/home/ubuntu/AWS-S3-Mini-Project/docker-compose.yml'
        FRONTEND_SERVICE    = 'frontend'

        // Fallback source location, used only when the job has no SCM configured.
        LOCAL_SOURCE_DIR    = 'C:\\Users\\Administrator\\Desktop\\AWS-S3-Mini-Project\\Frontend'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    stages {
        stage('Prepare') {
            steps {
                script {
                    try {
                        checkout scm
                    } catch (ignored) {
                        echo 'No SCM configured for this job, copying sources from the local folder instead.'
                        bat 'robocopy "%LOCAL_SOURCE_DIR%" "%WORKSPACE%" /E /XD node_modules dist .git & if %ERRORLEVEL% GEQ 8 (exit /b 1) else (exit /b 0)'
                    }

                    env.APP_DIR = fileExists('package.json') ? '.' : 'Frontend'
                    if (!fileExists("${env.APP_DIR}/package.json")) {
                        error 'Could not locate package.json in the workspace.'
                    }

                    withAws {
                        env.AWS_ACCOUNT_ID = bat(
                            script: '@aws sts get-caller-identity --query Account --output text',
                            returnStdout: true).trim()
                    }
                    env.ECR_REGISTRY   = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                    env.FRONTEND_IMAGE = "${env.ECR_REGISTRY}/${env.ECR_REPO}:${env.BUILD_NUMBER}"
                    env.LATEST_IMAGE   = "${env.ECR_REGISTRY}/${env.ECR_REPO}:latest"
                    echo "Deploying image ${env.FRONTEND_IMAGE}"
                }
            }
        }

        stage('Build webpack bundle') {
            steps {
                dir(env.APP_DIR) {
                    bat 'npm install'
                    bat 'npm run build'
                }
            }
        }

        stage('Build docker image') {
            steps {
                dir(env.APP_DIR) {
                    bat 'docker build -t %FRONTEND_IMAGE% -t %LATEST_IMAGE% .'
                }
            }
        }

        stage('Push image to ECR') {
            steps {
                script {
                    withAws {
                        bat '''
                            aws ecr describe-repositories --region %AWS_REGION% --repository-names %ECR_REPO% >nul 2>&1 ^
                              || aws ecr create-repository --region %AWS_REGION% --repository-name %ECR_REPO% >nul
                            aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %ECR_REGISTRY%
                            docker push %FRONTEND_IMAGE%
                            docker push %LATEST_IMAGE%
                        '''
                    }
                }
            }
        }

        stage('Deploy on EC2') {
            steps {
                script {
                    writeFile file: 'remote_deploy.sh', text: remoteDeployScript()

                    // SSH refuses keys readable by other accounts, so work on a locked-down copy.
                    bat '''
                        copy /Y "%PEM_DIR%\\%PEM_FILE%" "%WORKSPACE%\\deploy_key.pem" >nul
                        icacls "%WORKSPACE%\\deploy_key.pem" /inheritance:r >nul
                        icacls "%WORKSPACE%\\deploy_key.pem" /grant:r "%USERNAME%":R >nul
                    '''

                    bat '''
                        scp -o StrictHostKeyChecking=no -i "%WORKSPACE%\\deploy_key.pem" remote_deploy.sh %EC2_USER%@%EC2_HOST%:/tmp/remote_deploy.sh
                        ssh -o StrictHostKeyChecking=no -i "%WORKSPACE%\\deploy_key.pem" %EC2_USER%@%EC2_HOST% "chmod +x /tmp/remote_deploy.sh && AWS_REGION=%AWS_REGION% ECR_REGISTRY=%ECR_REGISTRY% FRONTEND_IMAGE=%LATEST_IMAGE% FRONTEND_SERVICE=%FRONTEND_SERVICE% COMPOSE_PATH=%REMOTE_COMPOSE_PATH% /tmp/remote_deploy.sh"
                    '''
                }
            }
        }
    }

    post {
        always {
            bat 'if exist "%WORKSPACE%\\deploy_key.pem" del /F /Q "%WORKSPACE%\\deploy_key.pem"'
            bat 'docker image rm -f %FRONTEND_IMAGE% %LATEST_IMAGE% 2>nul & exit /b 0'
        }
        success {
            echo "Frontend is live at http://${env.EC2_HOST}"
        }
    }
}

// Runs AWS CLI steps with explicit credentials when AWS_CREDENTIALS_ID is set,
// otherwise relies on the AWS config already present on the Jenkins machine.
def withAws(Closure body) {
    if (env.AWS_CREDENTIALS_ID?.trim()) {
        withCredentials([usernamePassword(
            credentialsId: env.AWS_CREDENTIALS_ID,
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
            body()
        }
    } else {
        body()
    }
}

def remoteDeployScript() {
    return '''#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-frontend}"
COMPOSE_PATH="${COMPOSE_PATH:-}"

if [ -z "$COMPOSE_PATH" ] || [ ! -f "$COMPOSE_PATH" ]; then
  echo "Looking for an existing docker-compose file under $HOME ..."
  COMPOSE_PATH="$(find "$HOME" -maxdepth 4 -name 'docker-compose*.y*ml' -not -path '*/node_modules/*' 2>/dev/null | head -n 1)"
fi
if [ -z "$COMPOSE_PATH" ]; then
  echo "No docker-compose file found on this instance." >&2
  exit 1
fi
echo "Using compose file: $COMPOSE_PATH"
cd "$(dirname "$COMPOSE_PATH")"
COMPOSE_FILE_NAME="$(basename "$COMPOSE_PATH")"

DOCKER="docker"
SUDO=""
if ! docker info >/dev/null 2>&1; then
  SUDO="sudo"
fi

if $SUDO $DOCKER compose version >/dev/null 2>&1; then
  compose() { $SUDO $DOCKER compose -f "$COMPOSE_FILE_NAME" "$@"; }
else
  compose() { $SUDO docker-compose -f "$COMPOSE_FILE_NAME" "$@"; }
fi

# Exported so a compose file written as "image: ${FRONTEND_IMAGE}" resolves to this build.
export FRONTEND_IMAGE

aws ecr get-login-password --region "$AWS_REGION" \\
  | $SUDO $DOCKER login --username AWS --password-stdin "$ECR_REGISTRY"

compose stop "$FRONTEND_SERVICE" || true
compose rm -f -v "$FRONTEND_SERVICE" || true
$SUDO $DOCKER image rm -f "$FRONTEND_IMAGE" >/dev/null 2>&1 || true

$SUDO $DOCKER pull "$FRONTEND_IMAGE"
compose up -d --no-deps --force-recreate "$FRONTEND_SERVICE"

$SUDO $DOCKER image prune -f >/dev/null 2>&1 || true
compose ps
'''
}
