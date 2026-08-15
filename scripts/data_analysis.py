"""Generate reproducible descriptive statistics, charts, and mechanism diagrams."""

import argparse
import json
import os
import sys
from html import escape


def write_mechanism_diagram(config, output_dir):
    title = str(config.get("title") or "研究机制图")
    nodes = [str(item).strip() for item in config.get("nodes", []) if str(item).strip()][:8]
    edges = config.get("edges", [])[:12]
    if len(nodes) < 2:
        raise ValueError("机制图至少需要两个节点")

    width = max(760, len(nodes) * 180)
    height = 260
    positions = [(70 + index * ((width - 140) / max(1, len(nodes) - 1)), 130) for index in range(len(nodes))]
    arrows = []
    for edge in edges:
        if not isinstance(edge, list) or len(edge) < 2:
            continue
        source, target = edge[0], edge[1]
        if isinstance(source, int) and isinstance(target, int) and 0 <= source < len(nodes) and 0 <= target < len(nodes):
            start, end = positions[source], positions[target]
            arrows.append(f'<line x1="{start[0] + 54:.0f}" y1="{start[1]}" x2="{end[0] - 54:.0f}" y2="{end[1]}" stroke="#627d98" stroke-width="2.5" marker-end="url(#arrow)"/>')
    if not arrows:
        arrows = [f'<line x1="{positions[index][0] + 54:.0f}" y1="{positions[index][1]}" x2="{positions[index + 1][0] - 54:.0f}" y2="{positions[index + 1][1]}" stroke="#627d98" stroke-width="2.5" marker-end="url(#arrow)"/>' for index in range(len(nodes) - 1)]
    boxes = []
    for (x, y), label in zip(positions, nodes):
        safe_label = escape(label)
        boxes.append(f'<rect x="{x - 54:.0f}" y="{y - 30}" width="108" height="60" rx="9" fill="#eef5fb" stroke="#3f6f99" stroke-width="2"/><text x="{x:.0f}" y="{y + 6}" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="14" fill="#18344d">{safe_label}</text>')
    output = os.path.join(output_dir, "mechanism-diagram.svg")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#627d98"/></marker></defs><text x="{width / 2:.0f}" y="45" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="20" font-weight="bold" fill="#18344d">{escape(title)}</text>{''.join(arrows)}{''.join(boxes)}</svg>'''
    with open(output, "w", encoding="utf-8") as handle:
        handle.write(svg)
    return {"kind": "mechanism-diagram", "summary": f"已生成包含 {len(nodes)} 个节点的机制图。", "files": [output]}


def analyze_data(config, output_dir):
    try:
        import pandas as pd
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise RuntimeError("数据绘图需要 Python 包 pandas、openpyxl 和 matplotlib。请安装后重试：python -m pip install pandas openpyxl matplotlib") from error

    source = config["source"]
    extension = os.path.splitext(source)[1].lower()
    if extension == ".csv":
        dataframe = pd.read_csv(source)
    elif extension == ".xlsx":
        dataframe = pd.read_excel(source, sheet_name=config.get("sheet") or 0)
    else:
        raise ValueError("数据绘图只支持 CSV 或 XLSX 文件")
    if dataframe.empty:
        raise ValueError("数据文件没有可分析的记录")

    numeric = dataframe.select_dtypes(include="number").columns.tolist()
    chart_type = config.get("chartType") or "auto"
    x_column = config.get("x") if config.get("x") in dataframe.columns else None
    y_column = config.get("y") if config.get("y") in dataframe.columns else None
    if chart_type == "auto":
        chart_type = "scatter" if len(numeric) >= 2 else "histogram"
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    figure, axis = plt.subplots(figsize=(8, 5))
    if chart_type == "correlation":
        if len(numeric) < 2:
            raise ValueError("相关性热力图至少需要两个数值列")
        matrix = dataframe[numeric].corr()
        image = axis.imshow(matrix, cmap="RdBu_r", vmin=-1, vmax=1)
        axis.set_xticks(range(len(numeric)), numeric, rotation=40, ha="right")
        axis.set_yticks(range(len(numeric)), numeric)
        figure.colorbar(image, ax=axis, label="Pearson correlation")
    elif chart_type == "scatter":
        if not x_column or not y_column:
            if len(numeric) < 2:
                raise ValueError("散点图需要指定两个数值列")
            x_column, y_column = numeric[:2]
        axis.scatter(dataframe[x_column], dataframe[y_column], alpha=0.7)
        axis.set_xlabel(x_column)
        axis.set_ylabel(y_column)
    elif chart_type == "bar":
        if not x_column or not y_column:
            if not numeric:
                raise ValueError("柱状图需要一个数值列")
            y_column = numeric[0]
            x_column = next((column for column in dataframe.columns if column != y_column), None)
        if not x_column:
            raise ValueError("柱状图需要分类列")
        grouped = dataframe.groupby(x_column, dropna=False)[y_column].mean().sort_values(ascending=False).head(20)
        axis.bar(grouped.index.astype(str), grouped.values)
        axis.tick_params(axis="x", rotation=40)
        axis.set_xlabel(x_column)
        axis.set_ylabel(f"{y_column} 的均值")
    else:
        selected = x_column if x_column in numeric else (numeric[0] if numeric else None)
        if not selected:
            raise ValueError("直方图需要至少一个数值列")
        axis.hist(dataframe[selected].dropna(), bins=min(30, max(8, int(len(dataframe) ** 0.5))), color="#4e79a7", edgecolor="white")
        axis.set_xlabel(selected)
        axis.set_ylabel("频数")
        chart_type = "histogram"
    axis.set_title(config.get("title") or f"{chart_type} 图")
    figure.tight_layout()
    chart_path = os.path.join(output_dir, "data-chart.png")
    figure.savefig(chart_path, dpi=180)
    plt.close(figure)
    summary_table = dataframe.describe(include="all").transpose().fillna("")
    table_path = os.path.join(output_dir, "descriptive-statistics.csv")
    summary_table.to_csv(table_path, encoding="utf-8-sig")
    table_rows = []
    for column, row in summary_table.head(20).iterrows():
        table_rows.append({
            "变量": str(column),
            "样本量": str(row.get("count", "")),
            "均值": str(row.get("mean", "")),
            "标准差": str(row.get("std", "")),
            "最小值": str(row.get("min", "")),
            "最大值": str(row.get("max", "")),
        })
    return {"kind": "data-analysis", "summary": f"读取 {len(dataframe)} 条记录、{len(dataframe.columns)} 个字段；生成 {chart_type} 图和描述统计表。", "columns": dataframe.columns.tolist(), "table": {"title": "描述性统计结果", "columns": ["变量", "样本量", "均值", "标准差", "最小值", "最大值"], "rows": table_rows}, "files": [chart_path, table_path]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output-dir", required=True)
    arguments = parser.parse_args()
    with open(arguments.config, encoding="utf-8") as handle:
        config = json.load(handle)
    os.makedirs(arguments.output_dir, exist_ok=True)
    result = write_mechanism_diagram(config, arguments.output_dir) if config.get("tool") == "mechanism_diagram" else analyze_data(config, arguments.output_dir)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
