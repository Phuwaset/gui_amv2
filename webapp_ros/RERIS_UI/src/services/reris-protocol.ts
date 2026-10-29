export enum ClientMode {
    VELOCITY_COMMAND = 0,
    GOAL_COMMAND = 1,
    POSE_ARRAY = 2,
    HEARTBEAT = 3,
    MULTI_POSE_ACTION = 4,
    RECORD_COMMAND = 5,
    SET_CURRENT_MAP = 6,
    MAP_EXPORT = 7,
    REQUEST_MAP = 8,
    MAP_RECEIVED_ACK = 9,
    ROUTINE_SAVE = 10,
    ROUTINE_DELETE = 11,
    SCHEDULE_SET = 12,
    SECURITY_CODE = 13,
    SCHEDULE_DELETE = 14,
    ROUTINE_LIST = 15,
    SCHEDULE_GET = 16,
    SIGNAL_TRIGGER = 17,
    SET_ADMIN_TOKEN = 18,
    RTT_PING = 99,
}

export enum ServerMode {
    MAP_DATA = 100,
    ODOMETRY_DATA = 101,
    NODES_STATUS = 102,
    PLAN_DATA = 103,
    RTT_PONG = 104,
    MAP_EXPORT_ACK = 105,
    ROUTINE_LIST_DATA = 106,
    SCHEDULE_DATA = 107,
    ROUTINE_ACK = 108,
}

export enum DataType {
    UINT8 = 0,
    INT8 = 1,
    UINT16 = 2,
    INT16 = 3,
    UINT32 = 4,
    INT32 = 5,
    UINT64 = 6,
    INT64 = 7,
    FLOAT16 = 8,
    FLOAT32 = 9,
    FLOAT64 = 10,
    STRING = 11,
    BYTES = 12,
}

type PackableValue = number | bigint | string | ArrayBuffer;
type PackArgument = [DataType, PackableValue];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function pack(mode: ClientMode | ServerMode, ...args: PackArgument[]): ArrayBuffer {
    let buffer = new ArrayBuffer(256);
    let view = new DataView(buffer);
    let offset = 0;

    const ensureCapacity = (needed: number) => {
        if (offset + needed > buffer.byteLength) {
            const newBuffer = new ArrayBuffer(buffer.byteLength * 2 + needed);
            new Uint8Array(newBuffer).set(new Uint8Array(buffer));
            buffer = newBuffer;
            view = new DataView(buffer);
        }
    };

    ensureCapacity(2);
    view.setUint8(offset++, 0x23); // Start byte
    view.setUint8(offset++, mode);

    for (const [dataType, value] of args) {
        ensureCapacity(1);
        view.setUint8(offset++, dataType);

        switch (dataType) {
            case DataType.UINT8:
                ensureCapacity(1);
                view.setUint8(offset++, value as number);
                break;
            case DataType.INT8:
                ensureCapacity(1);
                view.setInt8(offset++, value as number);
                break;
            case DataType.UINT16:
                ensureCapacity(2);
                view.setUint16(offset, value as number, false); // Big Endian
                offset += 2;
                break;
            case DataType.INT16:
                ensureCapacity(2);
                view.setInt16(offset, value as number, false);
                offset += 2;
                break;
            case DataType.UINT32:
                ensureCapacity(4);
                view.setUint32(offset, value as number, false);
                offset += 4;
                break;
            case DataType.INT32:
                ensureCapacity(4);
                view.setInt32(offset, value as number, false);
                offset += 4;
                break;
            case DataType.UINT64:
                ensureCapacity(8);
                view.setBigUint64(offset, BigInt(value as bigint), false);
                offset += 8;
                break;
            case DataType.INT64:
                ensureCapacity(8);
                view.setBigInt64(offset, BigInt(value as bigint), false);
                offset += 8;
                break;
            case DataType.FLOAT32:
                ensureCapacity(4);
                view.setFloat32(offset, value as number, false);
                offset += 4;
                break;
            case DataType.FLOAT64:
                ensureCapacity(8);
                view.setFloat64(offset, value as number, false);
                offset += 8;
                break;
            case DataType.STRING: {
                const encodedString = textEncoder.encode(value as string);
                ensureCapacity(4 + encodedString.length);
                view.setUint32(offset, encodedString.length, false);
                offset += 4;
                new Uint8Array(buffer, offset).set(encodedString);
                offset += encodedString.length;
                break;
            }
            case DataType.BYTES: {
                const bytesValue = value as ArrayBuffer;
                ensureCapacity(4 + bytesValue.byteLength);
                view.setUint32(offset, bytesValue.byteLength, false);
                offset += 4;
                new Uint8Array(buffer, offset).set(new Uint8Array(bytesValue));
                offset += bytesValue.byteLength;
                break;
            }
        }
    }

    ensureCapacity(1);
    view.setUint8(offset++, 0x0A); // Stop byte

    return buffer.slice(0, offset);
}

interface UnpackedMessage {
    mode: ClientMode | ServerMode;
    data: (number | bigint | string | ArrayBuffer)[];
}

export function unpack(arrayBuffer: ArrayBuffer): UnpackedMessage {
    const view = new DataView(arrayBuffer);
    let offset = 0;

    if (view.getUint8(offset++) !== 0x23 || view.getUint8(arrayBuffer.byteLength - 1) !== 0x0A) {
        throw new Error("Invalid message format");
    }

    const mode = view.getUint8(offset++) as ServerMode | ClientMode;
    const data: (number | bigint | string | ArrayBuffer)[] = [];

    while (offset < arrayBuffer.byteLength - 1) {
        const dataType = view.getUint8(offset++) as DataType;
        
        switch (dataType) {
            case DataType.UINT8: {
                data.push(view.getUint8(offset++));
                break;
            }
            case DataType.INT8: {
                data.push(view.getInt8(offset++));
                break;
            }
            case DataType.UINT16: {
                data.push(view.getUint16(offset, false));
                offset += 2;
                break;
            }
            case DataType.INT16: {
                data.push(view.getInt16(offset, false));
                offset += 2;
                break;
            }
            case DataType.UINT32: {
                data.push(view.getUint32(offset, false));
                offset += 4;
                break;
            }
            case DataType.INT32: {
                data.push(view.getInt32(offset, false));
                offset += 4;
                break;
            }
            case DataType.UINT64: {
                data.push(view.getBigUint64(offset, false));
                offset += 8;
                break;
            }
            case DataType.INT64: {
                data.push(view.getBigInt64(offset, false));
                offset += 8;
                break;
            }
            case DataType.FLOAT32: {
                data.push(view.getFloat32(offset, false));
                offset += 4;
                break;
            }
            case DataType.FLOAT64: {
                data.push(view.getFloat64(offset, false));
                offset += 8;
                break;
            }
            case DataType.STRING: {
                const strLen = view.getUint32(offset, false);
                offset += 4;
                const strBytes = new Uint8Array(arrayBuffer, offset, strLen);
                data.push(textDecoder.decode(strBytes));
                offset += strLen;
                break;
            }
            case DataType.BYTES: {
                const bytesLen = view.getUint32(offset, false);
                offset += 4;
                const bytes = arrayBuffer.slice(offset, offset + bytesLen);
                data.push(bytes);
                offset += bytesLen;
                break;
            }
        }
    }

    return { mode, data };
}
