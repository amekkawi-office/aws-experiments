'use strict';

const AWS = require('aws-sdk');
const express = require('express');
const app = express();

const ssm = new AWS.SSM({
    apiVersion: '2014-11-06'
});

// Environmental Variables
const envBasePath = process.env.URL_BASE_PATH || '/';
const envPort = parseInt(process.env.PORT) || 8000;
const envSecretName = process.env.SECRET_NAME || null;
const envSecretJSON = process.env.SECRET_JSON || null;

const serverStartTimestamp = new Date().toISOString();
const serverId = Math.round(Math.random() * 4294967295)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();

Promise.resolve()
    .then(() => {
        if (envSecretName) {
            log('Getting secret JSON...');
            getSecretJSON(envSecretName);
        }
        else if (envSecretJSON) {
            return JSON.parse(envSecretJSON);
        }
        else {
            return {};
        }
    })
    .then(startServer)
    .then(() => {
        log(`Started for ${envBasePath}`);
    })
    .catch((err) => {
        log(`Error while starting up: ${err.stack}`);
        process.exit(1);
    });

function startServer(params) {
    return new Promise((resolve, reject) => {
        log(`Starting server on port ${envPort}...`);

        let failHealthCheck = false;
        let logHealthCheck = 5;

        app.get('/healthcheck', (req, res) => {
            if (logHealthCheck) {
                log('Healthcheck');

                if (typeof logHealthCheck === 'number' && logHealthCheck > 0) {
                    logHealthCheck--;
                }
            }

            if (failHealthCheck) {
                res.statusCode = 500;
                res.end();
            }
            else {
                res.end();
            }
        });

        // Toggle logging the health check requests.
        app.get('/healthcheck/log', (req, res) => {
            logHealthCheck = !logHealthCheck;
            res.end(JSON.stringify(standardJSONResponse(req), null, 2));
        });

        // Set the health check to start failing.
        app.get('/healthcheck/fail', (req, res) => {
            failHealthCheck = true;
            res.end(JSON.stringify(standardJSONResponse(req), null, 2));
        });

        app.get(/\/.*/, (req, res) => {
            log(`${req.method} request to ${envBasePath}: ${req.originalUrl || req.url}`);

            res.contentType('application/json');
            res.end(JSON.stringify(standardJSONResponse(req), null, 2));
        });

        app.post(/\/.*/, (req, res) => {
            log(`${req.method} request to ${envBasePath}: ${req.originalUrl || req.url}`);

            const responseDelay = Math.max(0, parseInt(req.headers['x-response-delay']) || 500);

            setTimeout(() => {
                res.contentType('application/json');
                res.end(JSON.stringify(standardJSONResponse(req), null, 2));
            }, responseDelay);
        });

        app.listen(envPort, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });

        function standardJSONResponse(req) {
            return {
                serverId,
                serverStartTimestamp,
                message: `Greetings from ${envBasePath}`,
                method: req.method,
                url: req.originalUrl || req.url,
                headers: req.headers,
                logHealthCheck,
                failHealthCheck,
                params
            };
        }
    });
}

process.on('SIGTERM', () => {
    // Note: Only 30 second is available after SIGTERM is received.
    log(`SIGTERM for ${envBasePath}. Exiting...`);
    process.exit(0);
});

function getSecretJSON(name) {
    return ssm.getParameter({
        Name: name
    })
        .promise()
        .then((response) => {
            if (response.Parameter.Type !== 'String') {
                throw new Error(`Param must be "String" type: ${response.Parameter.Type}`);
            }

            try {
                return JSON.parse(response.Parameter.Value);
            }
            catch (err) {
                err.message = `Invalid param JSON -- ${err.message}`;
                throw err;
            }
        });
}

function log(msg) {
    process.stdout.write(`[${new Date().toISOString()}][${serverId}] ${msg}\n`);
}
