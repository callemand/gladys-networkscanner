const nmap = require('node-nmap');
const Promise = require('bluebird');


const PROTOCOL = 'network';
const SERVICE = 'networkscanner';

function getOrCreateDevice(name, identifier) {
    return new Promise(function(resolve, reject) {
        gladys.device.getByIdentifier({
            identifier: identifier,
            service:SERVICE
        })
        .then((device) => {
            //Device already register
            resolve(device);
        }).catch(() => {
            //Create new device
            gladys.device.create({
                device: {
                    name: name,
                    identifier: identifier,
                    protocol: PROTOCOL,
                    service: SERVICE
                },
                types: []
            })
            .then((device) => {
                var type = {
                    name: "State",
                    identifier: "state",
                    display: false,
                    type: 'binary',
                    sensor: true,
                    min: 0,
                    max: 1,
                    unit: "",
                    device: device.device.id
                };
                gladys.deviceType.create(type).then((deviceType) => {
                    var state = {
                        value: 1,
                        devicetype: deviceType.id
                    };
                    gladys.deviceState.create(state).then(() => {
                        resolve();
                    })
                    .catch((error) => {
                        // something bad happened ! :/
                        sails.log.debug(`Create a deviceState ${identifier} error ${error}`);
                    });
                })
                .catch((error) => {
                    sails.log.debug(`Create a type ${identifier} error ${error}`);
                })
            }).catch((error) => {
                sails.log.debug(`Create a device ${identifier} error ${error}`);
            })
        });
    });
}



module.exports = function scan() {

    // get the range of IP address

    var identifierFounded = {};
    var house;
    return gladys.param.getValue('NETWORK_SCANNER_HOSTS')
        .then((networkScannerHost) => {

            return new Promise(function(resolve, reject){
                var quickscan = new nmap.nodenmap.QuickScan(networkScannerHost);

                quickscan.on('complete', function(data){
                    sails.log.debug(`Network scan completed. Found ${data.length} devices.`);
                    resolve(data);
                });

                quickscan.on('error', function(error){
                    sails.log.error('Network Scanner Error :' + error);
                    reject(error);
                });
            });
        })
        .then((data) => {

            data = [
                {
                    ip: '192.168.0.41',
                    mac: 'PLOPPLOP'
                }
            ];
            // get house only if there is devices connected
            if(data.length === 0) return [data];
        
            return [data, gladys.machine.getMyHouse()];
        })
        .spread((data, house) => {
            house = house;
            for (var i = 0, len = data.length; i < len; i++) {
                identifierFounded[data[i].mac] = true;
            }

            return Promise.map(data, function(item){

                var name = item.hostname || item.ip;
                var identifier = item.mac;
                
                // if no name has been found
                // don't save device
                if(!name || !identifier) return null;

                return getOrCreateDevice(name, identifier);
            });
        }).then(() => {
            sails.log.debug('identifierFounded');
            sails.log.debug(identifierFounded);
            sails.log.debug('house');
            sails.log.debug(house);
            gladys.device.get().then((devices) => {
                sails.log.debug('Device');
                sails.log.debug(devices);
                return Promise.map(devices, function(device){
                    if(device.service == SERVICE){
                        gladys.deviceType.getByDevice(device).then(function(deviceTypes){
                            sails.log.debug('deviceTypes');
                            // do something
                            sails.log.debug(deviceTypes);

                            return Promise.map(deviceTypes, function(deviceType){
                                var changeState = undefined;
                                if(deviceType.identifier == 'state'){
                                    if(identifierFounded.hasOwnProperty(device.identifier) && deviceType.lastValue === 0){
                                        sails.log.debug('Change state to 1');
                                        changeState = 1;
                                    }else if(identifierFounded.hasOwnProperty(device.identifier) == false && deviceType.lastValue === 1){
                                        sails.log.debug('Change state to 0');
                                        changeState = 0;
                                    }
                                }
                                if ( typeof changeState !== 'undefined'){
                                    var state = {
                                        value: 1,
                                        devicetype: deviceType.id
                                    };
                                    gladys.deviceState.create(state).then(() => {
                                        sails.log.debug(`State change`);

                                        if(!device.user) return null;

                                        var event = {
                                            code: (changeState == 1) ? 'back-at-home' : 'left-home',
                                            user: device.user,
                                            house: house.id,
                                        };
                                        return gladys.event.create(event);
                                        //return gladys.house.userSeen({house: house.id, user: device.device.user});
                                    }).catch((error) => {
                                        // something bad happened ! :/
                                        sails.log.debug(`Create a deviceState ${deviceType.id} error ${error}`);
                                    });
                                }
                            });
                        })
                    }
                });
            });
        });
};