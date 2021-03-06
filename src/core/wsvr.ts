import {Server} from "http";
import {WSMeta} from "./meta/wsMeta";
import {HandlerMeta} from "./meta/handlerMeta";
import {CAssert, CError} from "@khgame/err";
import {IMsg, MSG_STATUS} from "./const";
import {WSContext, Runtime} from "./runtime";
import {ProxyHub, Session} from "../proxy";

/**
 * Provides standard of message sending
 */
export class WSvr {

    runtime: Runtime = new Runtime();
    proxyHub: ProxyHub<IMsg>;

    constructor(
        public readonly server: Server,
        public readonly targetConstructors: Function[],
        public readonly fnValidateToken: (token: string) => Promise<string | undefined>,
        public readonly fnClearCache: (identity: string) => Promise<any>,
        sessionTTLMs: number = 0,
    ) {
        this.proxyHub = new ProxyHub(
            server,
            fnValidateToken,
            this.dispatch.bind(this),
            fnClearCache,
            sessionTTLMs
        );

        targetConstructors
            .map(c => WSMeta.find(c))
            .filter(c => c)
            .map(tmi => HandlerMeta.list(tmi.targetClass))
            .reduce((prev: HandlerMeta[], mms: HandlerMeta[]) => prev.concat(mms), [])
            .forEach(this.runtime.addHandler.bind(this.runtime));
    }

    public sendMsg(uid: string, code: number, data: any, cbError?: (identity: string, msg: IMsg) => any) {
        const rep: IMsg = {
            code, data, status: MSG_STATUS.ok, timestamp: Date.now()
        };
        const result = this.proxyHub.emit(uid, rep);
        if (!result && cbError) {
            cbError(uid, rep);
        }
    }

    public sendMsgToAll(code: number, data: any) {
        const rep: IMsg = {
            code, data, status: MSG_STATUS.ok, timestamp: Date.now()
        };
        this.proxyHub.emitToAll(rep);
    }

    public async dispatch(session: Session<any>, msg: IMsg) {
        try {
            const ctx = new WSContext(
                session,
                msg,
                this.sendMsg.bind(this)
            );
            return await this.runtime.call(ctx, msg);
        } catch (e) {
            throw new CError(-1, e);
        }
    }

}
