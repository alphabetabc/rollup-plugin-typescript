import { PluginContext } from 'rollup';

class LogError {
    constructor(context: PluginContext) {
        this.context = context;
    }

    private errorMap = new Map();
    private context: PluginContext;
    private enableRollupErrorFlag: boolean | undefined = true;

    enableRollupError(v: boolean | undefined) {
        this.enableRollupErrorFlag = v;
    }

    error(msg: any) {
        if (this.enableRollupErrorFlag) {
            this.context.error(msg);
            // return;
        }

        const id = msg?.loc?.file;

        let errorItem = this.errorMap.get(id);

        if (errorItem === undefined) {
            errorItem = true;
            this.errorMap.set(id, errorItem);
        }

        this.context.warn(msg);
    }

    hasError(id: string) {
        return this.errorMap.get(id) || false;
    }

    clearError(id: string) {
        if (id === undefined) {
            this.errorMap = new Map();
            return;
        }
        this.errorMap.set(id, false);
    }
}

export default LogError;
