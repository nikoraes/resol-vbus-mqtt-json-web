/*! resol-vbus | Copyright (c) 2013-2018, Daniel Wippermann | MIT license */
'use strict';



const fs = require('fs');
const os = require('os');
const path = require('path');


const express = require('express');
const morgan = require('morgan');
const request = require('request');
const winston = require('winston');
const mqtt = require('mqtt');


const {
    HeaderSet,
    HeaderSetConsolidator,
    SerialConnection,
    Specification,
    TcpConnection
} = require('./resol-vbus');


const config = require('./config');



const specification = Specification.getDefaultSpecification();



const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});


const connectionClassByName = {
    SerialConnection,
    TcpConnection,
};


const headerSetConsolidator = new HeaderSetConsolidator({
    interval: config.loggingInterval,
    timeToLive: config.loggingTimeToLive,
});

const textHeaderSetConsolidator = new HeaderSetConsolidator({
    timeToLive: config.textLoggingTimeToLive,
});

/**
 * This function is called once the header set is considered "settled".
 * That means that the amount of unique packets in the header set has
 * been stable for a certain amount of time.
 *
 * @param {HeaderSet} headerSet
 */
const headerSetHasSettled = function(headerSet) {
    const packetFields = specification.getPacketFieldsForHeaders(headerSet.getHeaders());

    /*
    logger.debug(packetFields.map((packetField) => {
        return packetField.id + ': ' + packetField.name;
    }).join('\n'));
    */
};


/**
 * Connect to the VBus and store the packets into the global HeaderSetConsolidator.
 */
const connectToVBus = async () => {
    const ConnectionClass = connectionClassByName [config.connectionClassName];
    const connection = new ConnectionClass(config.connectionOptions);

    connection.on('connectionState', (connectionState) => {
        logger.debug('Connection state changed to ' + connectionState);
    });

    let hasSettled = false;
    let headerSet = new HeaderSet();
    let settledCountdown = 0;

    connection.on('packet', (packet) => {
        // logger.debug('Packet received...', packet);

        if (!hasSettled) {
            const headerCountBefore = headerSet.getHeaderCount();
            headerSet.addHeader(packet);
            const headerCountAfter = headerSet.getHeaderCount();

            if (headerCountBefore !== headerCountAfter) {
                settledCountdown = headerCountAfter * 2;
            } else if (settledCountdown > 0) {
                settledCountdown -= 1;
            } else {
                hasSettled = true;

                headerSetHasSettled(headerSet);
                headerSet = null;
            }
        }

        headerSetConsolidator.addHeader(packet);
        textHeaderSetConsolidator.addHeader(packet);
    });

    logger.debug('Connecting to VBus...');

    await connection.connect();

    logger.debug('Connected to VBus...');
};


const generateJsonData = async function() {
    const packetFields = specification.getPacketFieldsForHeaders(headerSetConsolidator.getSortedHeaders());

    const data = packetFields.map((pf) => {
        return {
            id: pf.id,
            name: pf.name,
            rawValue: pf.rawValue,
        };
    });

    return JSON.stringify(data, null, 4);
};


/**
 * Start the web server.
 */
const startWebServer = async () => {
    logger.debug('Starting web server...');

    const app = express();

    app.use(morgan('dev'));
    app.use(express.query());

    app.get('/', (req, res) => {
        generateJsonData().then(data => {
            res.status(200).type('application/json').end(data);
        }).then(null, (err) => {
            logger.error(err);
            res.status(500).type('text/plain').end(err.toString());
        });
    });

    app.listen(config.webServerPort, () => {
        logger.debug('Started web server at: ');
        logger.debug('  - http://0.0.0.0:' + config.webServerPort + '/ (internal)');
        for (const iface of Object.values(os.networkInterfaces())) {
            for (const ifaceConfig of iface) {
                if (ifaceConfig.family === 'IPv4') {
                    logger.debug('  - http://' + ifaceConfig.address + ':' + config.webServerPort + '/' + (ifaceConfig.internal ? ' (internal)' : ''));
                }
            }
        }
    });
};


const startHeaderSetConsolidatorTimer = async () => {
    logger.debug('Starting HeaderSetConsolidator timer...');

    headerSetConsolidator.startTimer();
};


const startMqttLogging = async () => {
    const onHeaderSet = async (headerSet, client) => {
        const headers = headerSet.getSortedHeaders();
        const packetFields = specification.getPacketFieldsForHeaders(headers);

        const valuesById = packetFields.reduce((memo, pf) => {
            const precision = pf.packetFieldSpec.type.precision;

            const roundedRawValue = pf.rawValue.toFixed(precision);

            // logger.debug('ID = ' + JSON.stringify(pf.id) + ', Name = ' + JSON.stringify(pf.name) + ', Value = ' + pf.rawValue + ', RoundedValue = ' + roundedRawValue);

            memo [pf.id] = roundedRawValue;
            return memo;
        }, {});

        const params = Object.keys(config.mqttPacketFieldMap).reduce((memo, key) => {
            const packetFieldId = config.mqttPacketFieldMap [key];

            let value;
            if (typeof packetFieldId === 'function') {
                value = packetFieldId(valuesById);
            } else {
                value = valuesById [packetFieldId];
            }
            if (typeof value === 'number') {
                value = value.toString();
            }
            if (typeof value === 'string') {
                memo [key] = value;
            }
            return memo;
        }, {});

        client.publish(config.mqttTopic, JSON.stringify(params));
    };

    if (config.mqttInterval) {
        logger.debug('Starting MQTT logging');
        const client = mqtt.connect(config.mqttConnect);

        client.on('connect', () => {
            logger.debug('Connected to MQTT broker');
            const hsc = new HeaderSetConsolidator({
                interval: config.mqttInterval,
            });

            hsc.on('headerSet', () => {
                onHeaderSet(headerSetConsolidator, client).then(null, err => {
                    logger.error(err);
                });
            });

            hsc.startTimer();
        });
    }
};



const main = async () => {
    await connectToVBus();

    await startWebServer();

    await startHeaderSetConsolidatorTimer();

    await startMqttLogging();

};



if (require.main === module) {
    main(process.argv.slice(2)).then(() => {
        logger.info('DONE!');
    }, err => {
        logger.error(err);
    });
} else {
    module.exports = main;
}
