/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
// DataExporter.jsx
import React from "react";
import styles from "./ExperimentManager.module.css";
import outputIcon from "/icon/output.svg";

const DataExporter = () => {
    const exportData = () => {
        // 获取所有实验数据
        const experiments = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("experiment_")) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    experiments.push(data);
                } catch (e) {
                    console.error("解析实验数据出错:", e);
                }
            }
        }

        if (experiments.length === 0) {
            alert("没有找到任何实验数据");
            return;
        }

        // 处理每个实验的数据
        const processedExperiments = experiments.map((experiment) => {
            // 确保 sessions 存在
            if (!experiment.sessions) {
                experiment.sessions = [];
            }

            // 获取该实验的眨眼历史数据
            const blinkHistoryKey = `blinkHistory_${experiment.experimentId}`;
            const blinkHistory = JSON.parse(
                localStorage.getItem(blinkHistoryKey) || "[]"
            );

            // 创建映射以便快速查找 blink_details
            const blinkDetailsMap = {};
            blinkHistory.forEach((record) => {
                blinkDetailsMap[record.gameId] = record.blink_details;
            });

            // 深拷贝实验数据以便修改
            const processedData = JSON.parse(JSON.stringify(experiment));

            // 将 blink_details 整合到 session 的 blinkData 中
            processedData.sessions.forEach((session) => {
                if (session.type === "blink" && session.blinkData) {
                    const details = blinkDetailsMap[session.gameId];
                    if (details) {
                        session.blinkData.blinkDetails = details;
                    }
                }
            });

            return processedData;
        });

        // 构建导出对象
        const exportObj = {
            meta: {
                exportDate: new Date().toISOString(),
                totalExperiments: processedExperiments.length,
            },
            experiments: processedExperiments,
        };

        // 创建并下载JSON文件
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
            type: "application/json",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `all-experiments-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <button onClick={exportData} className={styles.exportButton}>
            <img
                src={outputIcon}
                alt="导出所有实验数据"
                style={{ width: "30px" }}
            />
        </button>
    );
};

export default DataExporter;
