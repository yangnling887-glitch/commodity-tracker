#!/usr/bin/env python3
"""
大宗商品数据抓取脚本
每日由 GitHub Actions 自动运行，将数据写入 data/commodities.json
"""
import akshare as ak
import json
import yaml
import os
import sys
import traceback
from datetime import datetime, timedelta
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config", "commodities.yaml")
OUTPUT_PATH = os.path.join(ROOT, "data", "commodities.json")

# 历史数据起始日期（保留1年）
END_DATE = datetime.now()
START_1Y  = (END_DATE - timedelta(days=365)).strftime("%Y%m%d")
START_6M  = (END_DATE - timedelta(days=183)).strftime("%Y%m%d")
START_3M  = (END_DATE - timedelta(days=91)).strftime("%Y%m%d")
START_1M  = (END_DATE - timedelta(days=31)).strftime("%Y%m%d")
END_DATE_STR = END_DATE.strftime("%Y%m%d")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def df_to_price_list(df, date_col, price_col):
    """将 DataFrame 转换为 [{date, price}, ...] 列表"""
    result = []
    for _, row in df.iterrows():
        try:
            date_val = str(row[date_col])[:10]  # 只保留 YYYY-MM-DD
            price_val = float(row[price_col])
            if pd.notna(price_val) and price_val > 0:
                result.append({"date": date_val, "price": price_val})
        except Exception:
            pass
    return result


def df_to_value_list(df, date_col, value_col):
    """将 DataFrame 转换为 [{date, value}, ...] 列表"""
    result = []
    for _, row in df.iterrows():
        try:
            date_val = str(row[date_col])[:10]
            value_val = float(row[value_col])
            if pd.notna(value_val):
                result.append({"date": date_val, "value": value_val})
        except Exception:
            pass
    return result


def fetch_futures_price(symbol):
    """从新浪财经获取期货主力合约历史价格和持仓量"""
    try:
        df = ak.futures_main_sina(symbol=symbol, start_date=START_1Y, end_date=END_DATE_STR)
        if df is None or df.empty:
            return [], []
        df = df.sort_values(df.columns[0])  # 按日期排序

        # 列名适配（不同版本AKShare列名可能略有差异）
        cols = list(df.columns)
        date_col = cols[0]
        # 寻找收盘价列
        close_col = next((c for c in cols if "close" in c.lower() or "收盘" in c or c == "close"), cols[4])
        # 寻找持仓量列
        oi_col = next((c for c in cols if "hold" in c.lower() or "持仓" in c or c == "hold"), None)

        prices = df_to_price_list(df, date_col, close_col)

        open_interest = []
        if oi_col:
            open_interest = df_to_value_list(df, date_col, oi_col)

        return prices, open_interest
    except Exception as e:
        print(f"  [fetch_futures_price] {symbol} 失败: {e}")
        return [], []


def fetch_shfe_inventory(shfe_symbol):
    """获取上期所仓单数据（交易所库存）"""
    inventory = []
    try:
        # 按月获取近一年仓单数据
        current = END_DATE
        months_data = []
        seen_dates = set()

        for _ in range(13):  # 最多往前13个月
            month_str = current.strftime("%Y%m%d")
            try:
                df = ak.get_shfe_daily(trade_date=month_str)
                if df is not None and not df.empty:
                    # 找到对应品种
                    symbol_col = df.columns[0]
                    df_sym = df[df[symbol_col].astype(str).str.lower() == shfe_symbol.lower()]
                    if not df_sym.empty:
                        # 找仓单列
                        receipt_col = next(
                            (c for c in df_sym.columns if "仓单" in str(c) or "receipt" in str(c).lower()),
                            None
                        )
                        date_col = next(
                            (c for c in df_sym.columns if "日期" in str(c) or "date" in str(c).lower()),
                            None
                        )
                        if receipt_col and date_col:
                            for _, row in df_sym.iterrows():
                                d = str(row[date_col])[:10]
                                if d not in seen_dates:
                                    seen_dates.add(d)
                                    val = float(row[receipt_col]) if pd.notna(row[receipt_col]) else 0
                                    months_data.append({"date": d, "value": val})
            except Exception:
                pass
            current = current - timedelta(days=30)

        inventory = sorted(months_data, key=lambda x: x["date"])
    except Exception as e:
        print(f"  [fetch_shfe_inventory] {shfe_symbol} 失败: {e}")

    # 回退方案：使用期货仓单专用接口
    if not inventory:
        try:
            df = ak.futures_inventory_em(symbol=shfe_symbol.upper())
            if df is not None and not df.empty:
                cols = list(df.columns)
                date_col = cols[0]
                val_col = next((c for c in cols if "仓单" in str(c) or "库存" in str(c)), cols[1])
                inventory = df_to_value_list(df, date_col, val_col)
                inventory = sorted(inventory, key=lambda x: x["date"])
        except Exception as e2:
            print(f"  [fetch_shfe_inventory fallback] {shfe_symbol} 失败: {e2}")

    return inventory


def fetch_spot_price(spot_name):
    """从生意社获取现货历史价格"""
    try:
        df = ak.futures_spot_price_daily(
            start_day=START_1Y,
            end_day=END_DATE_STR,
            vars_list=[spot_name]
        )
        if df is None or df.empty:
            return []
        df = df.sort_values(df.columns[0])
        cols = list(df.columns)
        date_col = cols[0]
        price_col = next((c for c in cols if "价格" in str(c) or "price" in str(c).lower() or "现货" in str(c)), cols[1])
        return df_to_price_list(df, date_col, price_col)
    except Exception as e:
        print(f"  [fetch_spot_price] {spot_name} 失败: {e}")
        return []


def compute_latest(price_history):
    """计算最新价格和涨跌幅"""
    if not price_history:
        return None, None
    latest = price_history[-1]["price"]
    change = None
    if len(price_history) >= 2:
        prev = price_history[-2]["price"]
        if prev:
            change = round((latest - prev) / prev * 100, 2)
    return latest, change


def main():
    config = load_config()
    result = {}
    errors = []

    for commodity in config["commodities"]:
        cid = commodity["id"]
        name = commodity["name"]
        print(f"\n正在抓取: {name} ({cid})")

        data = {
            "id": cid,
            "name": name,
            "name_en": commodity.get("name_en", ""),
            "unit": commodity.get("unit", "元/吨"),
            "has_futures": commodity.get("has_futures", False),
            "exchange": commodity.get("exchange", ""),
            "latest_price": None,
            "price_change_pct": None,
            "price_history": [],
            "open_interest": [],
            "inventory": [],
        }

        try:
            if commodity.get("has_futures"):
                symbol = commodity["symbol"]
                prices, oi = fetch_futures_price(symbol)
                data["price_history"] = prices
                data["open_interest"] = oi

                shfe_sym = commodity.get("shfe_symbol")
                if shfe_sym:
                    data["inventory"] = fetch_shfe_inventory(shfe_sym)

                print(f"  价格记录: {len(prices)} 条，持仓量: {len(oi)} 条，库存: {len(data['inventory'])} 条")
            else:
                spot_name = commodity.get("spot_name", name)
                prices = fetch_spot_price(spot_name)
                data["price_history"] = prices
                print(f"  现货价格记录: {len(prices)} 条")

            data["latest_price"], data["price_change_pct"] = compute_latest(data["price_history"])

        except Exception as e:
            msg = f"{name}: {e}\n{traceback.format_exc()}"
            errors.append(msg)
            print(f"  [ERROR] {msg}")

        result[cid] = data

    result["_meta"] = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at_ts": int(datetime.now().timestamp()),
        "commodity_count": len(config["commodities"]),
        "errors": errors,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n数据已写入: {OUTPUT_PATH}")
    if errors:
        print(f"\n共 {len(errors)} 个品种抓取失败:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("全部品种抓取成功！")


if __name__ == "__main__":
    main()
