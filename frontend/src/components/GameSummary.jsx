/* eslint-disable react/prop-types */
const GameSummary = ({ data, onClose }) => {
    if (!data) return null;

    const renderSummary = () => {
        const { mode } = data;
        if (mode === "baseline") {
            return (
                <>
                    <p>Game: Baseline</p>
                    <p>Relaxation time ends</p>
                </>
            );
        }
        if (mode === "dice") {
            // 骰子空间模式
            return (
                <>
                    <p>Game: Dice</p>
                    <p>
                        Total Score:{data.totalPoints} (Target:{data.minPoints})
                    </p>
                    <p>Corridor Points:{data.dicePoints.join(", ")}</p>
                    <p>
                        Blink Count: Total {data.totalBlinks} Times (Left{data.leftBlinks}/Right
                        {data.rightBlinks})
                    </p>
                    <p>
                        Eye Closure Duration: {(data.closeEyeDuration / 1000).toFixed(2)} seconds
                    </p>
                    <p>Incorrect Switches: {data.wrongSwitches} times</p>
                    {data.isSuccess ? (
                        <p>🎉 Goal Achieved Successfully!</p>
                    ) : (
                        <p>❌ Failed to achieve the goal</p>
                    )}
                </>
            );
        }

        if (mode === "maze") {
            // 迷宫救援模式
            return (
                <>
                    <p>Game: Maze</p>
                    <p>
                        Time used：
                        {data.finalTime > 0
                            ? `${data.finalTime.toFixed(2)} seconds`
                            : "Unfinished"}{" "}
                        (Award: -{(data.timeBonus / 1000).toFixed(2)} seconds)
                    </p>
                    <p>
                        Blinks: Total{data.totalBlinks} Times (Left{data.leftBlinks}/Rignt
                        {data.rightBlinks})
                    </p>
                    <p>
                        Eye Closure Duration: {(data.closeEyeDuration / 1000).toFixed(2)} seconds
                    </p>
                    <p>Incorrect Turns: {data.wrongTurns} times</p>
                    {data.isSuccess ? <p>🎉 Successfully completed rescue operation！</p> : <p>❌ Fail</p>}
                </>
            );
        }
        return <p>未知模式</p>;
    };

    return (
        <div
            style={{
                position: "fixed",
                top: "20%",
                left: "50%",
                transform: "translateX(-50%)",
                background: "#222",
                color: "#fff",
                padding: "20px 30px",
                borderRadius: "12px",
                boxShadow: "0 0 10px rgba(0,0,0,0.5)",
                zIndex: 9999,
                minWidth: "300px",
                fontFamily: "Arial",
            }}>
            <h2 style={{ marginTop: 0 }}>Game Summary</h2>

            {renderSummary()}

            <button
                onClick={onClose}
                style={{
                    marginTop: "10px",
                    background: "#4CAF50",
                    border: "none",
                    padding: "8px 16px",
                    color: "white",
                    borderRadius: "6px",
                    cursor: "pointer",
                }}>
                NEXT
            </button>
        </div>
    );
};

export default GameSummary;
