"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveNotificationLog = exports.syncNotificationLog = void 0;
const sequelize_1 = require("sequelize");
const db_1 = __importDefault(require("../config/db"));
const NotificationLog = db_1.default.define("hris_notification_log", {
    id: {
        type: sequelize_1.DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
    },
    job_id: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
    },
    user_id: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: true,
    },
    jenis: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: true,
    },
    device_token: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM("SENT", "FAILED", "EXPIRED", "INVALID_TOKEN"),
        allowNull: false,
    },
    retry_count: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0,
    },
    error_message: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    processed_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    tableName: "hris_notification_log",
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
});
function syncNotificationLog() {
    return __awaiter(this, void 0, void 0, function* () {
        yield NotificationLog.sync({ alter: false });
    });
}
exports.syncNotificationLog = syncNotificationLog;
function saveNotificationLog(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield NotificationLog.create(data);
        }
        catch (err) {
            // log gagal simpan tidak boleh crash worker
            console.error("[DB] gagal simpan notification log:", err === null || err === void 0 ? void 0 : err.message);
        }
    });
}
exports.saveNotificationLog = saveNotificationLog;
exports.default = NotificationLog;
