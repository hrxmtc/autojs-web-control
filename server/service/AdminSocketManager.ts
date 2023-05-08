import * as querystring from 'querystring';
import * as http from 'http';
import getLogger from '@/utils/log4js';
import { verifyToken } from '@/middleware/app-jwt';
import { WebSocketManager, WebSocketExt } from './WebSocketManager';

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

    WebSocketManager.getInstance().addClientRequestListeners(async (req) => {
      const params = querystring.parse(req.url.replace('/?', ''));
      logger.info(`AdminSocketManager Client request param:${JSON.stringify(params)}`);
      try {
        const data = await verifyToken(params.token as string);
        logger.info(`AdminSocketManager verifyToken:${JSON.stringify(data)}`);
        return { type: 'admin', extData: data };
      } catch (error) {
        logger.info('addClientRequestListeners error :%o,',error);
        return { type: null };
      }
    });

    WebSocketManager.getInstance().addDeviceLogListener((client, data) => {
      data.data.device = client.extData;
      WebSocketManager.getInstance().getClients().forEach((c) => {
        logger.info(`AdminSocketManager addDeviceLogListener data:${JSON.stringify(data)},type:${c.type}`);
        if (c.type === 'admin') {
          WebSocketManager.getInstance().sendMessage(c, data);
        }
      });
    });

    WebSocketManager.getInstance().addClientStatusChangeListener((client, status) => {
      logger.info(`AdminSocketManager addClientStatusChangeListener status:${status},\tclient:${client.type}`);
      if (client.type === 'device') {
        WebSocketManager.getInstance().getClients().forEach((c) => {
          logger.info(`AdminSocketManager addClientStatusChangeListener forEach c:${c.type}`);
          if (c.type === 'admin') {
            WebSocketManager.getInstance().sendMessage(c, { type: 'device_change', data: { status } });
          }
        });
      }
    });
  }
}
