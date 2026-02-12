/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
// DataExporter.jsx
import React from "react";
import styles from "./ExperimentManager.module.css";
import outputIcon from "/icon/output.svg";

const DataExporter = () => {
    const exportData = () => {
        const experiments = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("experiment_")) {
                const data = JSON.parse(localStorage.getItem(key));
                // 此时 data.sessions 里的 blinkData 已经是完整的了
                experiments.push(data);
            }
        }

        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        meta: { exportDate: new Date().toISOString() },
                        experiments,
                    },
                    null,
                    2,
                ),
            ],
            { type: "application/json" },
        );

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
            <img src={outputIcon} alt="导出所有实验数据" style={{ width: "30px" }} />
        </button>
    );
};

export default DataExporter;
