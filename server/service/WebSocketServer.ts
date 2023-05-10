import {EventEmitter} from 'events';
import * as http from 'http';
import * as WebSocket from 'ws';
import getLogger from '@/utils/log4js';

const logger = getLogger('WebSocketServer');

export type IClientRequestListener = (req: http.IncomingMessage) => Promise<{ type: string, extData?: any }>;
export type IClientMessageListener = (client: WebSocketExt, data: WebSocket.Data) => void;
export type IClientStatusChangeListener = (client: WebSocketExt, status: 'open' | 'close' | 'error') => void;

export interface WebSocketExt extends WebSocket {
    isAlive: boolean;
    ip: string;
    type: 'device' | 'admin';
    extData?: any;
}

const clientRequestListeners: IClientRequestListener[] = [];
const clientMessageListeners: IClientMessageListener[] = [];
const clientStatusChangeListeners: IClientStatusChangeListener[] = [];

export class WebSocketServer extends EventEmitter {
    static instance: WebSocketServer;
    private readonly wss: WebSocket.Server;
    private readonly httpServer: http.Server;

    constructor(server: http.Server) {
        super();
        this.httpServer = server;
        this.wss = new WebSocket.Server({noServer: true});
        this.httpServer.on('upgrade', this.onUpgrade.bind(this));
    }

    public static init(server: http.Server) {
        if (!WebSocketServer.instance) {
            WebSocketServer.instance = new WebSocketServer(server);
        }
        return WebSocketServer.instance;
    }

    public static getInstance() {
        if (!WebSocketServer.instance) {
            logger.error('Cannot create multiple instances of WebSocketServer Singleton.');
        }
        return WebSocketServer.instance;
    }

    onUpgrade(request, socket, head) {
        this.authenticate(request)
            .then((authenticateInfo) => {
                if (authenticateInfo.type) {
                    this.wss.handleUpgrade(request, socket, head, (ws: any) => {
                        ws.type = authenticateInfo.type;
                        ws.extData = authenticateInfo.extData;
                        this.wss.emit('connection', ws, request);
                    });
                }
            })
            .catch((err) => {
                logger.error(`WebSocketManager authenticate error: ${err}`);
                socket.destroy();
            });

        this.wss.on('connection', this.onConnection.bind(this));
        this.wss.on('error', (err: Error) => {
            logger.error(`WebSocket.Server error ${err}`);
        });
    }

    async authenticate(req: http.IncomingMessage): Promise<{ type: string, extData?: any }> {
        let type = '';
        let extData = null;
        for (let i = 0; i < clientRequestListeners.length; i++) {
            const r = await clientRequestListeners[i](req);
            type = r.type || type;
            extData = r.extData || extData;
        }
        return {type, extData};
    }

    async onConnection(client: WebSocketExt) {
        client.on('message', this.onMessage.bind(this, client));
        client.on('close', this.onClose.bind(this, client));
        client.on('error', this.onError.bind(this, client));
    }

    onMessage(client: WebSocketExt, data: WebSocket.Data) {
        logger.info(`WebSocketServer  onMessage data:${JSON.stringify(data)}`);
        clientMessageListeners.forEach((listener) => {
            listener(client, data);
        });
    }

    onClose(client: WebSocketExt, code: number, message: string) {
        logger.info(`WebSocketServer  onClose code:${code},message:${message}`);
        clientStatusChangeListeners.forEach((listener) => {
            listener(client, 'close');
        });
    }

    onError(client: WebSocketExt, error: Error) {
        logger.info(`WebSocketServer  onError error:${error}`);
        clientStatusChangeListeners.forEach((listener) => {
            logger.info(`WebSocket onWebSocketConnection error listener: ${listener}`);
            listener(client, 'error');
        });
    }

    close() {
        logger.info(`WebSocketServer  close`);
        this.wss.close();
        this.emit('close');
    }

    public sendMessage(client: WebSocket, message: any, cb?: (err: Error, data?: any) => {}) {
        if (client.readyState === WebSocket.OPEN) {
            message.message_id = `${Date.now()}_${Math.random()}`;
            client.send(JSON.stringify(message), (err: Error) => {
                if (err) {
                    logger.error(`send message appear error -> ${err}`);
                    cb(err);
                }
            });
        }
    }

    public broadcast(message: object) {
        for (const ws of this.wss.clients.values()) {
            this.sendMessage(ws, message);
        }
    }

    public sendMessageToClients(clients: WebSocket[], message: object) {
        clients.forEach((client) => {
            this.sendMessage(client, message);
        });
    }

    public addClientRequestListeners(listener: IClientRequestListener) {
        clientRequestListeners.push(listener);
    }

    public addClientMessageListener(listener: IClientMessageListener) {
        clientMessageListeners.push(listener);
    }

    public addClientStatusChangeListener(listener: IClientStatusChangeListener) {
        clientStatusChangeListeners.push(listener);
    }

    public getClients() {
        return this.wss.clients as Set<WebSocketExt>;
    }

}

