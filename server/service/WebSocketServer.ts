import {EventEmitter} from 'events';
import * as http from 'http';
import * as WebSocket from 'ws';
import getLogger from '@/utils/log4js';

const logger = getLogger('WebSocketServer');

export type ClientRequestListener = (req: http.IncomingMessage) => Promise<{ type: string, extData?: any }>;
export type ClientMessageListener = (client: WebSocketExt, data: WebSocket.Data) => void;
export type ClientStatusChangeListener = (client: WebSocketExt, status: 'open' | 'close' | 'error') => void;

export interface WebSocketExt extends WebSocket {
    isAlive: boolean;
    ip: string;
    type: 'device' | 'admin';
    extData?: any;
}

const clientRequestListeners: ClientRequestListener[] = [];
const clientMessageListeners: ClientMessageListener[] = [];
const clientStatusChangeListeners: ClientStatusChangeListener[] = [];

export class WebSocketServer extends EventEmitter {
    private static instance: WebSocketServer;
    private readonly wss: WebSocket.Server;
    private readonly httpServer: http.Server;

    private constructor(server: http.Server) {
        super();
        this.httpServer = server;
        this.wss = new WebSocket.Server({noServer: true});
        this.httpServer.on('upgrade', this.handleUpgrade.bind(this));
        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (err: Error) => {
            logger.error(`WebSocket.Server error ${err}`);
        });
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


    handleUpgrade(request, socket, head) {
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
    }

    async authenticate(req: http.IncomingMessage): Promise<{ type: string, extData?: any }> {
        let type = '';
        let extData = null;
        for (const listener of clientRequestListeners) {
            const r = await listener(req);
            type = r.type || type;
            extData = r.extData || extData;
        }
        return {type, extData};
    }

    handleConnection(client: WebSocketExt) {
        client.on('open', this.handleOpen.bind(this, client));
        client.on('message', this.handleMessage.bind(this, client));
        client.on('close', this.handleClose.bind(this, client));
        client.on('error', this.handleError.bind(this, client));

    }

    handleMessage(client: WebSocketExt, data: WebSocket.Data) {
        logger.info(`WebSocketServer onMessage data:${JSON.stringify(data)}`);
        clientMessageListeners.forEach((listener) => {
            listener(client, data);
        });
    }

    handleOpen(client: WebSocketExt) {
        clientStatusChangeListeners.forEach((listener) => {
            logger.info(`WebSocket onOpen `);
            listener(client, 'open');
        });
    }
    handleClose(client: WebSocketExt, code: number, message: string) {
        logger.info(`WebSocketServer onClose code:${code},message:${message}`);
        clientStatusChangeListeners.forEach((listener) => {
            listener(client, 'close');
        });
    }

    handleError(client: WebSocketExt, error: Error) {
        logger.info(`WebSocketServer onError error:${error}`);
        clientStatusChangeListeners.forEach((listener) => {
            logger.info(`WebSocket onWebSocketConnection error listener: ${error}`);
            listener(client, 'error');
        });
    }

    close() {
        logger.info(`WebSocketServer close`);
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

    public getClients() {
        return this.wss.clients as Set<WebSocketExt>;
    }

    public addClientRequestListener(listener: ClientRequestListener) {
        clientRequestListeners.push(listener);
    }

    public addClientMessageListener(listener: ClientMessageListener) {
        clientMessageListeners.push(listener);
    }

    public addClientStatusChangeListener(listener: ClientStatusChangeListener) {
        clientStatusChangeListeners.push(listener);
    }

}
