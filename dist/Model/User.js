"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const sequelize_1 = require("sequelize");
const db_1 = __importDefault(require("../config/db"));
exports.User = db_1.default.define('users_device', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    member_id: {
        type: new sequelize_1.DataTypes.STRING(128),
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
    device_token: {
        type: new sequelize_1.DataTypes.STRING(128),
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
}, {
    freezeTableName: true,
    tableName: "users_device",
    timestamps: false
});
// User.init(
//     {
//         id: {
//             type: DataTypes.INTEGER,
//             primaryKey: true,
//             autoIncrement: true,
//         },
//         member_id: {
//             type: DataTypes.STRING,
//             allowNull: false,
//             validate: {
//                 notEmpty: true,
//             },
//         },
//         token_device: {
//             type: DataTypes.STRING,
//             allowNull: false,
//             validate: {
//                 notEmpty: true,
//             },
//         },
//     },
//     {
//         sequelize: db,
//         modelName: 'users_device', // Make sure the model name matches the table name in the database
//         timestamps: false,
//     }
// );
exports.default = exports.User;
