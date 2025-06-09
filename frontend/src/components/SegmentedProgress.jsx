/* eslint-disable react/prop-types */
import "react";
import "./SegmentedProgress.css";

const SegmentedProgress = ({
    currentTask,
    totalTasks,
    taskInfo,
    taskStatus,
    progress,
    taskResults, // 新增：传入任务结果数组
}) => {
    return (
        <div className="segmented-progress-container">
            {/* 任务信息显示 */}
            <div className="task-info">
                <h3 className="task-text">{taskInfo.text}</h3>
                {taskStatus && (
                    <span
                        className="task-status"
                        style={{
                            backgroundColor:
                                taskStatus === "Success!"
                                    ? "#4CAF50"
                                    : "#F44336",
                            color: "white",
                        }}>
                        {taskStatus}
                    </span>
                )}
            </div>

            {/* 分段进度条 */}
            <div className="segmented-progress-bar">
                {Array.from({ length: totalTasks }).map((_, index) => {
                    // 根据任务结果决定颜色
                    let segmentClass = "segment";
                    if (index < currentTask) {
                        segmentClass +=
                            taskResults[index] === "Success!"
                                ? " completed-success"
                                : " completed-fail";
                    } else if (index === currentTask) {
                        segmentClass += " active";
                    }

                    return (
                        <div key={index} className={segmentClass}>
                            {/* 当前活跃段落的进度 */}
                            {index === currentTask && (
                                <div
                                    className="segment-progress"
                                    style={{ width: `${progress * 100}%` }}
                                />
                            )}
                            <span className="segment-label">{index + 1}</span>
                        </div>
                    );
                })}
            </div>

            {/* 任务计数器 */}
            <div className="task-counter">
                任务 {Math.min(currentTask + 1, totalTasks)} / {totalTasks}
            </div>
        </div>
    );
};

export default SegmentedProgress;
