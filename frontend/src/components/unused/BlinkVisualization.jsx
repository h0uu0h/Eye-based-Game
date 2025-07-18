import { useState, useEffect } from "react";
import { ResponsiveLine } from "@nivo/line";
import "./BlinkVisualization.css";

const BlinkVisualization = () => {
    const [experimentData, setExperimentData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const experiments = JSON.parse(
            localStorage.getItem("experimentData") || "[]"
        );
        setExperimentData(experiments);
        setLoading(false);
    }, []);

    const processBlinkData = (rawData) => {
        const games = rawData.filter(
            (game) =>
                game.mode === "classic" && game.events && game.events.length > 0
        );

        const blinkEvents = games.flatMap((game) =>
            game.events
                .filter((event) => event.type === "blink")
                .map((event) => ({
                    timestamp: event.timestamp,
                    total: event.data.total,
                    gameId: game.gameId,
                    startTime: game.startTime,
                    endTime: game.endTime,
                }))
        );

        const gamesData = {};
        games.forEach((game) => {
            if (!gamesData[game.gameId]) {
                gamesData[game.gameId] = {
                    id: game.gameId,
                    data: [],
                };
            }
        });

        blinkEvents.forEach((event) => {
            const gameStart = event.startTime;
            const timeInGame = (event.timestamp - gameStart) / 1000;
            if (!isNaN(timeInGame) && isFinite(event.total)) {
                gamesData[event.gameId].data.push({
                    x: timeInGame,
                    y: event.total,
                });
            }
        });

        return Object.values(gamesData);
    };

    if (loading) return <div className="loading">加载数据中...</div>;
    if (experimentData.length === 0)
        return <div className="empty">没有找到实验数据</div>;

    const lineData = processBlinkData(experimentData).filter(
        (series) =>
            Array.isArray(series.data) &&
            series.data.length > 0 &&
            series.data.every(
                (point) =>
                    typeof point.x === "number" &&
                    typeof point.y === "number" &&
                    !isNaN(point.x) &&
                    !isNaN(point.y)
            )
    );

    return (
        <div className="container">
            <h2 className="title">眨眼事件随时间变化</h2>
            <div className="chart-wrapper">
                <ResponsiveLine
                    data={lineData}
                    margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
                    xScale={{ type: "linear" }}
                    yScale={{
                        type: "linear",
                        min: "auto",
                        max: "auto",
                        stacked: false,
                    }}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                        orient: "bottom",
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: "游戏时间 (秒)",
                        legendOffset: 36,
                        legendPosition: "middle",
                    }}
                    axisLeft={{
                        orient: "left",
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: "眨眼次数",
                        legendOffset: -40,
                        legendPosition: "middle",
                    }}
                    colors={{ scheme: "category10" }}
                    pointSize={8}
                    pointColor={{ theme: "background" }}
                    pointBorderWidth={2}
                    pointBorderColor={{ from: "serieColor" }}
                    pointLabelYOffset={-12}
                    useMesh={true}
                    legends={[
                        {
                            anchor: "bottom-right",
                            direction: "column",
                            translateX: 100,
                            itemWidth: 80,
                            itemHeight: 20,
                            symbolSize: 12,
                            symbolShape: "circle",
                            effects: [
                                {
                                    on: "hover",
                                    style: {
                                        itemBackground: "rgba(0, 0, 0, .03)",
                                        itemOpacity: 1,
                                    },
                                },
                            ],
                        },
                    ]}
                />
            </div>

            <div className="table-section">
                <h3>数据统计</h3>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>游戏ID</th>
                            <th>眨眼次数</th>
                            <th>持续时间 (秒)</th>
                            <th>开始时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineData.map((game) => {
                            const originalGame = experimentData.find(
                                (g) => g.gameId === game.id
                            );
                            return (
                                <tr key={game.id}>
                                    <td>{game.id.substring(0, 8)}...</td>
                                    <td>
                                        {game.data.length > 0
                                            ? game.data[game.data.length - 1].y
                                            : 0}
                                    </td>
                                    <td>
                                        {originalGame
                                            ? (
                                                  (originalGame.endTime -
                                                      originalGame.startTime) /
                                                  1000
                                              ).toFixed(2)
                                            : "N/A"}
                                    </td>
                                    <td>
                                        {originalGame
                                            ? new Date(
                                                  originalGame.startTime
                                              ).toLocaleTimeString()
                                            : "N/A"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BlinkVisualization;
