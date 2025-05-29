# README

Project: Eye_based Game (https://www.notion.so/Eye_based-Game-1f15a1a2ee248030b16ece492f4b108f?pvs=21)
Status: Not started

# 眨眼交互系统（Flask + React）

## 🧠 项目简介

本项目基于 Flask 后端和 React 前端构建，结合 OpenCV + MediaPipe 实现实时眼部识别，支持通过眨眼控制音乐、完成交互游戏或响应指令命令。项目使用 Socket.IO 进行前后端通信，具有多模式交互和可视化反馈功能。

---

## ⚙️ 环境搭建指南

### 📌 后端（Python 3.12 + venv）

1. 创建虚拟环境（推荐使用 `venv`）：

```bash
cd backend
python -m venv venv
# 启动虚拟环境
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

```

1. 安装依赖：

```bash
pip install -r requirements.txt
```

`requirements.txt` 内容如下：

```
Flask==3.0.2
flask-socketio==5.3.6
python-socketio==5.11.2
eventlet==0.35.1
Flask-Cors==4.0.0
opencv-python==4.9.0.80
mediapipe==0.10.21
numpy==1.26.4
```

1. 启动后端服务：

```bash
python app.py
```

默认运行在 `http://localhost:5000`，提供视频流 (`/video_feed`) 和实时事件接口。

---

### 🌐 前端（React）

> 确保安装了 Node.js >= 16 和 npm
> 
1. 安装依赖：

```bash
cd frontend
npm install
```

推荐的前端依赖：

- `react`, `react-dom`
- `socket.io-client`
- `antd`
- `@nivo/line`（用于图表）

如缺少：

```bash
npm install socket.io-client antd @nivo/line
```

1. 启动开发服务：

```bash
npm run dev
```

访问地址通常为 `http://localhost:3000`，前端通过 Socket.IO 与后端进行通信。

---

## 📁 项目结构概览

```
EYEYE/
├── backend/                   # Python 后端目录
│   ├── app.py                 # 主服务入口，含视频流与 socket 通信
│   ├── main.py                # 面部识别参考（弃用）
│   ├── earm_detect.py         # EARM算法（弃用）
│   ├── mesh_map.jpg           # 面部点示意
│   ├── requirements.txt       # 后端依赖列表
│   └── test.py                # 测试脚本（弃用）
│
├── frontend/                  # React 前端目录
│   ├── public/                # 静态文件（如 index.html）
│   ├── src/                   # 主源码目录
│   │   ├── assets/            # 资源（如图片、音频）
│   │   ├── components/        # 模块化组件
│   │   │   ├── BlinkGame.jsx
│   │   │   ├── ClassicMode.jsx
│   │   │   ├── CommandMode.jsx
│   │   │   ├── ControlMode.jsx
│   │   │   ├── EarmWaveform.jsx
│   │   │   ├── MusicControl.jsx
│   │   │   └── MusicMode.jsx
│   │   └── App.jsx, App.css   # 前端主入口
│   ├── package.json           # 前端依赖列表
```

---

## 🚀 启动流程

完成依赖配置后

```bash
# 后端
# mac
source venv/bin/activate
# windows
venv/Scripts/activate

python app.py

# 前端（单独终端）
cd frontend
npm run dev
```