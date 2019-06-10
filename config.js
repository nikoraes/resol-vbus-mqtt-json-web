/*! resol-vbus | Copyright (c) 2013-2018, Daniel Wippermann | MIT license */
'use strict';



const path = require('path');



module.exports = {

    /**
     * Name of the Connection class to use to connect.
     */
    connectionClassName: 'SerialConnection',

    /**
     * Options for the Connection instance.
     */
    connectionOptions: {
        path: '/dev/ttyVbus'
    },

    /**
     * Logging interval in milliseconds.
     */
    loggingInterval: 10000,

    /**
     * Logging time to live in milliseconds.
     */
    loggingTimeToLive: 60000,

    /**
     * Port number to bind the web server to.
     */
    webServerPort: 8083,

    /**
     * Interval (milliseconds) in which data will be uploaded to MQTT. A value of zero disables this functionality.
     */
    mqttInterval: 10000,

    /**
     * MQTT connect parameters, https://github.com/mqttjs/MQTT.js#connect
     */
    mqttConnect: {
        host: 'localhost',
        port: '1883',
        username: 'resol',
        password: 'niHERE.00'
    },

    /**
     * MQTT topic to publish to.
     */
    mqttTopic: 'resol',

    /**
     * A map of MQTT message attributes to VBus packet field IDs.
     *
     * An example sensor in Home Assistant would be:
     * - platform: mqtt
     *    name: "Resol Collector Temp"
     *    state_topic: "home/resol"
     *    unit_of_measurement: '°C'
     *    value_template: "{{ value_json.temp1 }}"
     */
    mqttPacketFieldMap: {
        temp1: '00_0010_4278_10_0100_000_2_0',
        temp2: '00_0010_4278_10_0100_002_2_0',
        relay1: '00_0010_4278_10_0100_008_1_0',
        relay1hrs: '00_0010_4278_10_0100_012_2_0'
    }

};
