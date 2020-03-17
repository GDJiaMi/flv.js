/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Log from '../utils/logger.js';
import {BaseLoader, LoaderStatus, LoaderErrors} from './loader.js';
import {RuntimeException} from '../utils/exception.js';

// For FLV over in electron stream
class StreamLoader extends BaseLoader {

    /**
     * 只能用于渲染引擎
     */
    static isSupported() {
        return 'process' in window && window.process.type === 'renderer';
    }

    constructor(seekHandler, config) {
        super('stream-loader');
        this.TAG = 'StreamLoader';

        this._needStash = true;
        this._config = config;

        this._requestAbort = false;
        this._stream = null;
        this._receivedLength = 0;
    }

    destroy() {
        if (this._ws) {
            this.abort();
        }
        super.destroy();
    }

    open(dataSource) {
        try {
            const {PassThrough} = require('stream');
            const stream = this._stream = new PassThrough();
            const mediaServer = this._config.mediaServer;

            if (mediaServer == null) {
                throw new Error('mediaServer 不能为空');
            }

            stream.on('readable', this._onStreamReadable.bind(this));
            stream.on('end', this._onStreamClose.bind(this));
            stream.on('close', this._onStreamClose.bind(this));
            stream.on('data', this._onStreamMessage.bind(this));
            stream.on('error', this._onStreamError.bind(this));

            mediaServer.connect(dataSource.url, stream);

            this._status = LoaderStatus.kConnecting;
        } catch (e) {
            this._status = LoaderStatus.kError;

            let info = {code: e.code, msg: e.message};

            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        }
    }

    abort() {
        let stream = this._stream;
        if (stream && stream.readable) {
            this._requestAbort = true;
            stream.destroy();
        }

        this._stream = null;
        this._status = LoaderStatus.kComplete;
    }

    _onStreamReadable(e) {
        this._status = LoaderStatus.kBuffering;
    }

    _onStreamClose(e) {
        if (this._requestAbort === true) {
            this._requestAbort = false;
            return;
        }

        this._status = LoaderStatus.kComplete;

        if (this._onComplete) {
            this._onComplete(0, this._receivedLength - 1);
        }
    }

    _onStreamMessage(chunk) {
        if (Buffer.isBuffer(chunk)) {
            this._dispatchArrayBuffer(chunk.buffer);
        } else {
            this._status = LoaderStatus.kError;
            let info = {code: -1, msg: 'Unsupported Stream message type'};

            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        }
    }

    _dispatchArrayBuffer(arraybuffer) {
        let chunk = arraybuffer;
        let byteStart = this._receivedLength;
        this._receivedLength += chunk.byteLength;

        if (this._onDataArrival) {
            this._onDataArrival(chunk, byteStart, this._receivedLength);
        }
    }

    _onStreamError(e) {
        this._status = LoaderStatus.kError;

        let info = {
            code: e.code,
            msg: e.message
        };

        if (this._onError) {
            this._onError(LoaderErrors.EXCEPTION, info);
        } else {
            throw new RuntimeException(info.msg);
        }
    }

}

export default StreamLoader;
