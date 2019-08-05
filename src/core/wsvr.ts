import {Server} from "http";
import {WSServer} from "../wsServer";
import {UserSession} from "../userSession";
import {WSMeta} from "./meta/wsMeta";
import {HandlerMeta} from "./meta/handlerMeta";
import {CAssert, CError} from "@khgame/err";
import {IMsg} from "./const";
import {WSContext} from "./context";
import {ParamMeta} from "./meta/paramMeta";

export class WSvr {

    handlers: { [code: number]: HandlerMeta; } = {};

    assert = new CAssert();

    wsServer: WSServer<IMsg>;

    constructor(
        public readonly server: Server,
        public readonly targetConstructors: Function[],
        public readonly fnValidateToken: (token: string) => Promise<string | undefined>
    ) {
        this.wsServer = new WSServer(server, fnValidateToken, this.dispatch.bind(this));

        targetConstructors
            .map(c => WSMeta.find(c))
            .filter(c => c)
            .map(tmi => HandlerMeta.list(tmi.targetClass))
            .reduce((prev: HandlerMeta[], mms: HandlerMeta[]) => prev.concat(mms), [])
            .forEach((handlerMeta: HandlerMeta) => {
                this.handlers[handlerMeta.code] = handlerMeta;
            });
    }

    public async dispatch(session: UserSession<any>, msg: IMsg) {
        // this.assert.cok(msg.status === "ok", -1, `dispatch failed: msg.status !== "ok"`); // not for request
        const handlerMeta = this.handlers[msg.code];

        this.assert.cok(handlerMeta, -1, () => `dispatch failed: cannot find handler of code ${msg.code}`);

        try {
            return await this.call(handlerMeta, session, msg);
        } catch (e) {
            throw new CError(-1, e);
        }
    }

    getTarget(targetClass: Function) {
        const targetMeta = WSMeta.find(targetClass);
        if (!targetMeta) {
            console.error(`cannot find the target : ${targetClass}, is it initialized?`);
            return undefined;
        }
        return targetMeta.instance;
    }

    async call(handlerMeta: HandlerMeta, session: UserSession<any>, msg: IMsg) {
        const matchedArgs = handlerMeta.getParamMetas();
        const targetInstance = this.getTarget(handlerMeta.targetClass);
        // todo: assert this
        let result: any = undefined;
        const ctx = new WSContext(
            session,
            session.uid,
            msg
        );

        console.log(">> msg:", msg, matchedArgs.length);

        try {
            if (matchedArgs.length <= 0) {
                result = await targetInstance[handlerMeta.methodName].apply(targetInstance, [msg.data, ctx]);
            } else { // using array
                const args: any = [];
                matchedArgs.forEach((paramMeta: ParamMeta) => {
                    // console.log("paramMeta", paramMeta);
                    args[paramMeta.index] = paramMeta.isContext ? ctx : msg.data[paramMeta.key];
                });
                // console.log("combined args", args);
                result = await targetInstance[handlerMeta.methodName].apply(targetInstance, args);
            }
            if (handlerMeta.rspCode !== undefined) {
                ctx.rspOK(handlerMeta.rspCode, result);
            }
        } catch (error) {
            console.log("wsvr.call error: ", error);
            if (handlerMeta.rspCode !== undefined) {
                let errorCode: any = 500;
                if (error instanceof CError) {
                    errorCode = error.code;
                } else if (error.hasOwnProperty("statusCode")) {
                    errorCode = error.statusCode;
                }

                const msgCode = Number(error.message || error);
                const errorMsg = isNaN(msgCode) ? (error.message || error) : msgCode;
                ctx.rspERR(handlerMeta.rspCode, {
                    code: errorCode,
                    msg: errorMsg
                });
            }
        }

    }

}