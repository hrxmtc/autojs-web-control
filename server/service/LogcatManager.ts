import getLogger from '@/utils/log4js';


const logger = getLogger('LogcatManager');

export class LogcatManager {
    static instance: LogcatManager;

    public static getInstance() {
        if (!LogcatManager.instance) {
            logger.info('LogcatManager Not initialized!');
        }
        return LogcatManager.instance;
    }

    public static init() {
    }

    public log() {
    }

    public addListener(listener: any) {
    }
}