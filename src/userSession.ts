import {Server, Socket} from "socket.io";
import {LRUNode} from "./chain/lru";
import {LinkedLst} from "./chain/linkedLst";
import {UserSessionFactory} from "./userSessionFactory";

export type SessionMsgHandler<TMessage> = (session: UserSession<TMessage>, message: string) => void;

export class UserSession<TMessage> extends LRUNode {

    lastHeartBeat: number;

    msgQueue: LinkedLst<TMessage> = new LinkedLst<TMessage>();

    constructor(
        protected readonly factory: UserSessionFactory<TMessage>,
        public readonly socket: Socket,
        public readonly uid: string,
        public readonly msgHandler: SessionMsgHandler<TMessage>,
        public readonly max_queue_length: number = -1
    ) {
        super();
        this.heartBeat();
    }

    public emit(event: string | symbol, ...args: any[]): boolean {
        return this.socket.emit(event, ...args);
    }

    public heartBeat(): this {
        this.lastHeartBeat = Date.now();
        return this;
    }

    public onMessage(massages: TMessage[]) {
        try {
            massages.forEach(msg => {
                this.enqueueMsg(msg);
            });
        }
        catch (e) {
            console.error(e);
        }
    }

    private enqueueMsg(msg: TMessage) {
        if (this.max_queue_length > 0 && this.msgQueue.length >= this.max_queue_length) {
            this.factory.remove(this.uid);
            const error = `too much message ${this.msgQueue.length}, socket ${this.uid} closed.`;
            this.emit("SYSTEM_ERROR", {
                error
            });
            console.error(error);
            return;
        }
        this.msgQueue.push(msg);
    }
}
