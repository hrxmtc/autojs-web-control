import * as querystring from 'querystring';
import getLogger from '@/utils/log4js';
import {verifyToken} from '@/middleware/app-jwt';
import {WebSocketServer} from './WebSocketServer';

const logger = getLogger('AdminSocketManager');

export class AdminSocketManager {
    static instance: AdminSocketManager;

    public static getInstance() {
        if (!AdminSocketManager.instance) {
            logger.info('AdminSocketManager Not initialized!');
        }
        return AdminSocketManager.instance;
    }

    public static init() {
        if (!AdminSocketManager.instance) {
            AdminSocketManager.instance = new AdminSocketManager();
        }

        WebSocketServer.getInstance().addClientRequestListeners(this.handleClientRequest());

        WebSocketServer.getInstance().addClientMessageListener(this.handleClientMessage());

        WebSocketServer.getInstance().addClientStatusChangeListener(this.handleClientStatusChange());

    }

    static handleClientStatusChange() {
        return (client, status) => {
            logger.info(`AdminSocketManager addClientStatusChangeListener status:${status},\tclient:${client.type}`);
            if (client.type === 'device') {
                WebSocketServer.getInstance().getClients().forEach((c) => {
                    if (c.type === 'admin') {
                        WebSocketServer.getInstance().sendMessage(c, {type: 'device_change', data: {status}});
                    }
                });
            }
        };
    }

    static handleClientMessage() {
        return (client, data) => {
            const message = JSON.parse(data as string);
            if (message.type == 'log') {
                message.data.device = client.extData;
                WebSocketServer.getInstance().getClients().forEach((c) => {
                    logger.info(`AdminSocketManager addDeviceLogListener data:${JSON.stringify(data)},type:${c.type}`);
                    if (c.type === 'admin') {
                        WebSocketServer.getInstance().sendMessage(c, message);
                    }
                });
            }
        };
    }

    static handleClientRequest() {
        return async (req) => {
            const params = querystring.parse(req.url.replace('/?', ''));
            logger.info(`AdminSocketManager Client request param:${JSON.stringify(params)}`);
            let authentication = {type: null, extData: null};
            if (!!params.token) {
                try {
                    const data = await verifyToken(params.token as string);
                    authentication.type = 'admin';
                    authentication.extData = data;
                } catch (error) {
                    logger.info('addClientRequestListeners error :%o,', error);
                }
            }
            return authentication;
        };
    }
}
