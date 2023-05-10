import * as querystring from 'querystring';
import getLogger from '@/utils/log4js';
import DeviceModel from '@/model/device.model';
import {WebSocketServer} from './WebSocketServer';
import moment = require('moment');

const logger = getLogger('DeviceManager');

export class DeviceManager {
    private static instance: DeviceManager;

    private constructor() {
    }

    public static getInstance() {
        if (!DeviceManager.instance) {
            logger.info('DeviceManager Not initialized!');
        }
        return DeviceManager.instance;
    }

    public static init() {
        if (!DeviceManager.instance) {
            DeviceManager.instance = new DeviceManager();
            WebSocketServer.getInstance().addClientRequestListener(DeviceManager.handleClientRequest.bind(this));
            WebSocketServer.getInstance().addClientMessageListener(DeviceManager.handleClientMessage.bind(this));
        }

        return DeviceManager.instance;
    }

    private static handleClientMessage(client, data) {
        if (client.type === 'device') {
            const message = JSON.parse(data as string);
            logger.info(`DeviceManager client message: ${JSON.stringify(message)}`);
            if (message.type === 'hello') {
                WebSocketServer.getInstance().sendMessage(client, {
                    type: 'hello',
                    data: 'ok',
                    debug: false,
                    version: 11090
                });
            }
            if (message.type === 'ping') {
                const data = message.data;
                WebSocketServer.getInstance().sendMessage(client, {type: 'pong', data: data});
            }
        }
    }

    private static async handleClientRequest(request) {
        const params = querystring.parse(request.url.replace('/?', ''));
        logger.info(`DeviceManager Client Request query param: ${JSON.stringify(params)}`);
        if (params.token) {
            return {type: null};
        }
        const ip = (request.connection.remoteAddress || (request.headers['x-forwarded-for'] as any || '').split(/\s*,\s*/)[0]).replace(/[^0-9\.]/ig, '');
        const deviceName = params.name || ip;
        let device = await DeviceModel.getByDeviceName(deviceName as string);
        if (!device) {
            await DeviceModel.insert({name: deviceName, ip, create_time: moment().format('YYYY-MM-DD HH:mm:ss')});
        }

        device = await DeviceModel.getByDeviceName(deviceName);
        await DeviceModel.updateById(device.device_id, {connect_time: moment().format('YYYY-MM-DD HH:mm:ss')});

        return {type: 'device', extData: device};
    }

    public getOnlineDevices() {
        const deviceClients = [];
        WebSocketServer.getInstance().getClients().forEach((c) => {
            if (c.type === 'device') {
                deviceClients.push({
                    ip: c.ip,
                    device_name: c.extData.name,
                });
            }
        });
        return deviceClients;
    }

    public disconnectDeviceByIp(ip: string) {
        WebSocketServer.getInstance().getClients().forEach((c) => {
            if (c.type === 'device' && c.ip === ip) {
                c.terminate();
            }
        });
    }

    public disconnectDeviceByName(name: string) {
        WebSocketServer.getInstance().getClients().forEach((c) => {
            if (c.type === 'device' && c.extData.name === name) {
                c.terminate();
            }
        });
    }
}
