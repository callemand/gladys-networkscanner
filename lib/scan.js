const nmap = require('node-nmap');
const Promise = require('bluebird');


const PROTOCOL = 'network';
const SERVICE = 'networkscanner';

function getOrCreateDevice(name, identifier) {
    return new Promise(function(resolve, reject) {
        sails.log.debug(`Get By identifier ${identifier}`);
        gladys.device.getByIdentifier({
            identifier: identifier+Math.random(),
            service:SERVICE
        })
        .then((device) => {
            sails.log.debug(`Founded By identifier ${identifier}`);
            //Device already register
            resolve(device);
        }).catch(() => {
            sails.log.debug(`Create a device  ${identifier}`);
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
                sails.log.debug(`Create a type  ${identifier}`);
                sails.log.debug(`Create a type  ${device}`);
                var type = {
                    name: "State",
                    type: 'binary',
                    sensor: true,
                    min: 0,
                    max: 1,
                    unit: "",
                    device: device.id
                };
                gladys.deviceType.create(type).then(() => {
                    resolve(device);
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

            // get house only if there is devices connected
            if(data.length === 0) return [data];    
        
            return [data, gladys.machine.getMyHouse()];
        })
        .spread((data, house) => {

            return Promise.map(data, function(item){

                var name = item.hostname || item.ip;
                var identifier = item.mac;
                
                // if no name has been found
                // don't save device
                if(!name || !identifier) return null;

                return getOrCreateDevice(name, identifier);
                /*
                .then((device) => {
                    if(!device.device || !device.device.user) return null;

                    // the user has been seen, save it
                    return gladys.house.userSeen({house: house.id, user: device.device.user});
                });
                */
            });
        });
};