import * as querystring from 'querystring';
import getLogger from '@/utils/log4js';
import {verifyToken} from '@/middleware/app-jwt';
import {
    WebSocketServer,
    ClientRequestListener,
    ClientMessageListener,
    ClientStatusChangeListener
} from './WebSocketServer';

const logger = getLogger('WebAdminManager');

export class WebAdminManager {
    private static instance: WebAdminManager;

    private constructor() {
    }

    public static getInstance() {
        if (!WebAdminManager.instance) {
            logger.info('WebAdminManager Not initialized!');
        }
        return WebAdminManager.instance;
    }

    public static init() {
        if (!WebAdminManager.instance) {
            WebAdminManager.instance = new WebAdminManager();
            WebSocketServer.getInstance().addClientRequestListener(WebAdminManager.handleClientRequest());
            WebSocketServer.getInstance().addClientMessageListener(WebAdminManager.handleClientMessage());
            WebSocketServer.getInstance().addClientStatusChangeListener(WebAdminManager.handleClientStatusChange());
        }
        return WebAdminManager.instance;
    }

    private static handleClientStatusChange(): ClientStatusChangeListener {
        return (client, status) => {
            logger.info(`WebAdminManager addClientStatusChangeListener status:${status},\tclient:${client.type}`);
            if (client.type === 'device') {
                WebSocketServer.getInstance().getClients().forEach((c) => {
                    if (c.type === 'admin') {
                        WebSocketServer.getInstance().sendMessage(c, {type: 'device_change', data: {status}});
                    }
                });
            }
        };
    }

    private static handleClientMessage(): ClientMessageListener {
        return (client, data) => {
            const message = JSON.parse(data as string);
            if (message.type == 'log') {
                message.data.device = client.extData;
                WebSocketServer.getInstance().getClients().forEach((c) => {
                    logger.info(`WebAdminManager addDeviceLogListener data:${JSON.stringify(data)},type:${c.type}`);
                    if (c.type === 'admin') {
                        WebSocketServer.getInstance().sendMessage(c, message);
                    }
                });
            }
        };
    }

    private static handleClientRequest(): ClientRequestListener {
        return async (req) => {
            const params = querystring.parse(req.url.replace('/?', ''));
            logger.info(`WebAdminManager Client request param:${JSON.stringify(params)}`);
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
