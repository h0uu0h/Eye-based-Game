/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from "react";
import { ResponsiveLine } from "@nivo/line";
import { FaFileExport, FaTimes, FaTrash } from "react-icons/fa";
import { io } from "socket.io-client";
import EarmWaveform from "./EarWaveform";
import "./DataPanel.css";

const DataPanel = ({ onClose, experimentData, setExperimentData }) => {
    const [activeTab, setActiveTab] = useState("waveform");
    const socketRef = useRef(null);

    // 初始化Socket连接
    useEffect(() => {
        if (!socketRef.current) {
            socketRef.current = io(import.meta.env.VITE_SOCKET_URL);

            // 监听眼睛特征点事件
            socketRef.current.on("eye_landmarks", (data) => {
                if (data.ratios) {
                    setExperimentData((prev) => ({
                        ...prev,
                        frames: [
                            ...prev.frames,
                            {
                                timestamp: Date.now(),
                                ratios: {
                                    avg: data.ratios.avg_ratio,
                                    left: data.ratios.left_ratio,
                                    right: data.ratios.right_ratio,
                                },
                            },
                        ],
                    }));
                }
            });

            // 监听校准事件
            socketRef.current.on("calibrated", (data) => {
                setExperimentData((prev) => ({
                    ...prev,
                    calibration: [
                        ...prev.calibration,
                        {
                            timestamp: Date.now(),
                            threshold: data.threshold,
                        },
                    ],
                    events: [
                        ...prev.events,
                        {
                            timestamp: Date.now(),
                            type: "calibration_complete",
                            data,
                        },
                    ],
                }));
            });

            // 监听眨眼事件
            socketRef.current.on("blink_event", (data) => {
                setExperimentData((prev) => ({
                    ...prev,
                    events: [
                        ...prev.events,
                        {
                            timestamp: Date.now(),
                            type: "blink",
                            data,
                        },
                    ],
                }));
            });

            // 监听眼睛状态变化
            socketRef.current.on("eye_state", (data) => {
                setExperimentData((prev) => ({
                    ...prev,
                    events: [
                        ...prev.events,
                        {
                            timestamp: Date.now(),
                            type: "eye_state",
                            data,
                        },
                    ],
                }));
            });

            // 监听左眼状态变化
            socketRef.current.on("left_eye_state", (data) => {
                setExperimentData((prev) => ({
                    ...prev,
                    events: [
                        ...prev.events,
                        {
                            timestamp: Date.now(),
                            type: "left_eye_state",
                            data,
                        },
                    ],
                }));
            });

            // 监听右眼状态变化
            socketRef.current.on("right_eye_state", (data) => {
                setExperimentData((prev) => ({
                    ...prev,
                    events: [
                        ...prev.events,
                        {
                            timestamp: Date.now(),
                            type: "right_eye_state",
                            data,
                        },
                    ],
                }));
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    // 准备图表数据
    const prepareChartData = () => {
        const avgRatios = [];
        const leftRatios = [];
        const rightRatios = [];

        // 取最近100个数据点
        const dataPoints = experimentData.frames.slice(-100);

        dataPoints.forEach((frame) => {
            const timestamp = new Date(frame.timestamp).toLocaleTimeString();
            if (frame.ratios) {
                avgRatios.push({ x: timestamp, y: frame.ratios.avg });
                leftRatios.push({ x: timestamp, y: frame.ratios.left });
                rightRatios.push({ x: timestamp, y: frame.ratios.right });
            }
        });

        return [
            {
                id: "平均比率",
                data: avgRatios,
                color: "#00ff99",
            },
            {
                id: "左眼比率",
                data: leftRatios,
                color: "#cc66ff",
            },
            {
                id: "右眼比率",
                data: rightRatios,
                color: "#ff9966",
            },
        ];
    };

    // 导出实验数据
    const exportExperimentData = () => {
        const experiments = JSON.parse(
            localStorage.getItem("experimentData") || "[]"
        );
        if (experiments.length === 0) {
            alert("没有实验数据可导出！");
            return;
        }

        const blob = new Blob([JSON.stringify(experiments, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `experiment_data_${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    };
    const deleteExperimentData = () => {
        const confirmDelete = window.confirm(
            "你确定要删除所有实验数据吗？此操作无法撤销！"
        );
        if (!confirmDelete) return;

        localStorage.removeItem("experimentData");
        setExperimentData({
            gameId: null,
            mode: null,
            startTime: null,
            endTime: null,
            frames: [],
            events: [],
            calibration: [],
        });

        alert("实验数据已删除！");
    };
    return (
        <div className="data-panel">
            <div className="panel-header">
                <div className="panel-tabs">
                    <button
                        className={activeTab === "waveform" ? "active" : ""}
                        onClick={() => setActiveTab("waveform")}>
                        实时波形
                    </button>
                    {/* <button
                        className={activeTab === "chart" ? "active" : ""}
                        onClick={() => setActiveTab("chart")}>
                        数据分析
                    </button> */}
                    <button
                        className={activeTab === "stats" ? "active" : ""}
                        onClick={() => setActiveTab("stats")}>
                        实验统计
                    </button>
                </div>

                <div className="panel-controls">
                    <button
                        className="export-btn"
                        onClick={exportExperimentData}>
                        <FaFileExport /> 导出数据
                    </button>
                    <button
                        className="close-btn"
                        onClick={deleteExperimentData}>
                        <FaTrash /> 删除数据
                    </button>
                    <button className="close-btn" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
            </div>

            <div className="panel-content">
                {activeTab === "waveform" && (
                    <div className="waveform-container">
                        <EarmWaveform />
                    </div>
                )}

                {activeTab === "chart" && (
                    <div className="chart-container">
                        <ResponsiveLine
                            data={prepareChartData()}
                            margin={{
                                top: 20,
                                right: 20,
                                bottom: 60,
                                left: 50,
                            }}
                            xScale={{ type: "point" }}
                            yScale={{ type: "linear", min: 0, max: 1 }}
                            curve="linear"
                            axisBottom={{
                                orient: "bottom",
                                tickSize: 5,
                                tickPadding: 5,
                                tickRotation: -45,
                                legend: "时间",
                                legendOffset: 40,
                                legendPosition: "middle",
                            }}
                            axisLeft={{
                                orient: "left",
                                tickSize: 5,
                                tickPadding: 5,
                                tickRotation: 0,
                                legend: "眨眼比率",
                                legendOffset: -40,
                                legendPosition: "middle",
                            }}
                            enablePoints={false}
                            enableGridX={false}
                            colors={(d) => d.color}
                            lineWidth={2}
                            useMesh={true}
                            legends={[
                                {
                                    anchor: "bottom-right",
                                    direction: "column",
                                    justify: false,
                                    translateX: 100,
                                    translateY: 0,
                                    itemsSpacing: 0,
                                    itemDirection: "left-to-right",
                                    itemWidth: 80,
                                    itemHeight: 20,
                                    itemOpacity: 0.75,
                                    symbolSize: 12,
                                    symbolShape: "circle",
                                    symbolBorderColor: "rgba(0, 0, 0, .5)",
                                    effects: [
                                        {
                                            on: "hover",
                                            style: {
                                                itemBackground:
                                                    "rgba(0, 0, 0, .03)",
                                                itemOpacity: 1,
                                            },
                                        },
                                    ],
                                },
                            ]}
                        />
                    </div>
                )}

                {activeTab === "stats" && (
                    <div className="stats-container">
                        <div className="stat-card">
                            <h3>实验概览</h3>
                            <p>
                                <span>游戏ID:</span> {experimentData.gameId}
                            </p>
                            <p>
                                <span>模式:</span> {experimentData.mode}
                            </p>
                            <p>
                                <span>开始时间:</span>{" "}
                                {new Date(
                                    experimentData.startTime
                                ).toLocaleString()}
                            </p>
                            <p>
                                <span>持续时间:</span>
                                {experimentData.endTime
                                    ? `${(
                                          (experimentData.endTime -
                                              experimentData.startTime) /
                                          1000
                                      ).toFixed(1)} 秒`
                                    : "进行中"}
                            </p>
                        </div>

                        <div className="stat-card">
                            <h3>数据统计</h3>
                            <p>
                                <span>总帧数:</span>{" "}
                                {experimentData.frames.length}
                            </p>
                            <p>
                                <span>眨眼事件:</span>{" "}
                                {
                                    experimentData.events.filter(
                                        (e) => e.type === "blink"
                                    ).length
                                }
                            </p>
                            <p>
                                <span>状态变化:</span>{" "}
                                {
                                    experimentData.events.filter(
                                        (e) => e.type === "eye_state"
                                    ).length
                                }
                            </p>
                            <p>
                                <span>校准次数:</span>{" "}
                                {experimentData.calibration.length}
                            </p>
                        </div>

                        <div className="stat-card">
                            <h3>最近事件</h3>
                            <div className="event-list">
                                {experimentData.events
                                    .slice(-5)
                                    .map((event, index) => (
                                        <div key={index} className="event-item">
                                            <span className="event-time">
                                                {new Date(
                                                    event.timestamp
                                                ).toLocaleTimeString()}
                                            </span>
                                            <span
                                                className={`event-type ${event.type}`}>
                                                {event.type}
                                            </span>
                                            {event.data && (
                                                <span className="event-data">
                                                    {JSON.stringify(event.data)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="panel-footer">
                <span className="hint">按 &apos;H&apos; 键隐藏面板</span>
            </div>
        </div>
    );
};

export default DataPanel;
