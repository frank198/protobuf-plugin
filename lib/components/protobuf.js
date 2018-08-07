const protobuf = require("protobufjs");
const SERVER = 'server';
const CLIENT = 'client';
const fs = require('fs');
const path = require('path');
const watchers = Symbol('watchers');

class ProtoBuffJs
{
    constructor(app, opts)
    {
        this.app = app;
        this.version = 0;
        this[watchers] = new Map();
        opts = opts || {};
        this.serverProtosPath = opts.serverProtos || '/config/serverProtos.json';
        this.clientProtosPath = opts.clientProtos || '/config/clientProtos.json';
        this.serverPBPath = opts.serverPBPath || '/config/serverProto.proto';
        this.clientPBPath = opts.clientPBPath || '/config/clientProto.proto';
        this.logger = opts.logger || console;
    }

    start(cb)
    {
        this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
        this.setProtos(CLIENT, path.join(this.app.getBase(), this.clientProtosPath));
        this.encodeBuilder = protobuf.loadSync(path.join(this.app.getBase(), this.serverPBPath));
        this.decodeBuilder = protobuf.loadSync(path.join(this.app.getBase(), this.clientPBPath));
        process.nextTick(cb);
    }

    check(type, route)
    {
        switch(type) {
            case SERVER:
                if(!this.encodeBuilder) {
                    logger.warn('decodeIO encode builder is undefined.');
                    return null;
                }
                try{
                    this.encodeBuilder.lookupTypeOrEnum(route);
                    return true;
                }
                catch (e) {
                    throw new Error(e);
                }
                break;
            case CLIENT:
                if(!this.decodeBuilder) {
                    logger.warn('decodeIO decode builder is undefined.');
                    return null;
                }
                try{
                    this.decodeBuilder.lookupTypeOrEnum(route);
                    return true;
                }
                catch (e) {
                    throw new Error(e);
                }
                break;
            default:
                throw new Error('decodeIO meet with error type of protos, type: ' + type + ' route: ' + route);
                break;
        }
    }

    encode(route, message)
    {
        const encodeInstance = this.encodeBuilder.lookupType(route);
        if (encodeInstance != null)
        {
            const messageInstance = encodeInstance.create(message);
            return Encoder.encode(messageInstance).finish();
        }
        return null;
    }

    decode(route, message)
    {
        const decodeInstance = this.decodeBuilder.lookupType(route);
        if (decodeInstance != null)
        {
            const messageInstance = decodeInstance.decode(message);
            return messageInstance.toJSON();
        }
        return null;
    }

    getProtos()
    {
        return {
            server  : this.serverProtos,
            client  : this.clientProtos,
            version : this.version
        };
    }

    getVersion()
    {
        return this.version;
    }

    setProtos(type, filePath)
    {
        if (!fs.existsSync(filePath))
        {
            return;
        }

        const stats = fs.statSync(filePath);
        if (stats.isFile())
        {
            const baseName = path.basename(filePath);
            if (type === SERVER)
            {
                this.serverProtos = require(filePath);
            }
            else if (type === CLIENT)
            {
                this.clientProtos = require(filePath);
            }
            // Set version to modify time
            const time = stats.mtime.getTime();
            if (this.version < time)
            {
                this.version = time;
            }

            // Watch file
            const watcher = fs.watch(filePath, this.onUpdate.bind(this, type, filePath));
            if (this[watchers].has(baseName))
            {
                this[watchers].get(baseName).close();
            }
            this[watchers].set(baseName, watcher);
        }
        else if (stats.isDirectory())
        {
            const files = fs.readdirSync(filePath);
            files.forEach((val, index) =>
            {
                const fPath = path.join(filePath, val);
                const stats = fs.statSync(fPath);
                if (stats.isFile()) this.setProtos(type, fPath);
            });
        }

    }

    onUpdate(type, filePath, event)
    {
        if (event !== 'change')
        {
            return;
        }
        try
        {
            if (type === SERVER || type === CLIENT)
            {
                const data = fs.readFileSync(filePath, 'utf8');
                if (type === SERVER)
                {
                    this.serverProtos = JSON.parse(data);
                }
                else if (type === CLIENT)
                {
                    this.clientProtos = JSON.parse(data);
                }
            }
            this.version = fs.statSync(filePath).mtime.getTime();
            this.logger && this.logger.debug('change proto file , type : %j, path : %j, version : %j', type, filePath, this.version);
        }
        catch (err)
        {
            this.logger && this.logger.warn('change proto file error! path : %j', filePath);
            this.logger && this.logger.warn(err);
        }
    }

    stop(force, cb)
    {
        for (const watcher of this[watchers].values())
        {
            if (watcher)
                watcher.close();
        }
        this[watchers].clear();
        this[watchers] = null;
        process.nextTick(cb);
    }
}

module.exports = function (app, opts)
{
    return new ProtoBuffJs(app, opts);
};
ProtoBuffJs.prototype.name = '__decodeIO__protobuf__';
