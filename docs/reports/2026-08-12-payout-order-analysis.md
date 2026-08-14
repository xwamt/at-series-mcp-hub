# 代发订单数据分析报告（2026年8月）

| 项 | 内容 |
| --- | --- |
| 状态 | 已完成 |
| 版本 | v1.0 |
| 更新时间 | 2026-08-12 06:15:00 +08:00 |
| 适用环境 | 生产只读库 `PROD-mysql-从` |
| 数据库 / 表 | `cl_offline_admin.payout_order`（口语名 cl-admin-offline） |
| 统计窗口 | 2026-08-01 00:00:00 ~ 2026-08-12（含当日已入库数据） |
| 责任人 | 待确认 |
| 证据来源 | JumpServer MySQL CLI 只读查询 |

---

## 1. 结论摘要

**已验证事实**（采集约 2026-08-12 06:10–06:15 +08）：

| 指标 | 数值 |
| --- | ---: |
| 代发订单总数 | **23,520** 笔 |
| 原始金额合计（INR） | **418,705,396.00** |
| 折算人民币合计（CNY） | **35,028,522.50** |
| 成功订单（order_status=0） | 20,864 笔 / 360,690,127.00 INR / **30,175,016.49** CNY |
| 失败（order_status=1） | 851 笔 |
| 处理中（order_status=2） | 1,805 笔 |
| 成功率（按笔数） | 88.71% |

窗口内交易币种均为 **INR**；人民币为系统功能汇率折算值（见 §4）。

---

## 2. 统计口径

| 项 | 说明 |
| --- | --- |
| 业务对象 | 代发订单 → 表 `payout_order` |
| 时间字段 | `create_time` |
| 金额字段 | `transaction_amount` + `transaction_currency` |
| 订单状态 | 0=成功，1=失败，2=处理中 |
| 删除标记 | 本窗口 `deleted` 均为 0，未额外过滤 |
| 分表 | 另有历史表 `payout_order_202509`，本窗口数据均在主表 |

---

## 3. 每日明细

> 无订单日：2026-08-01、08-08、08-09（观察：多为周末）。  
> 2026-08-12 为截止日部分时段，成功笔数仍为 0（多为处理中，属正常滞后）。

| 日期 | 笔数 | 金额 INR | 金额 CNY | 成功笔数 | 成功 INR | 成功 CNY |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-08-02 | 411 | 7,766,422.00 | 649,731.98 | 404 | 7,600,611.00 | 635,860.38 |
| 2026-08-03 | 3,536 | 62,577,780.00 | 5,235,201.64 | 3,408 | 60,090,242.00 | 5,027,096.41 |
| 2026-08-04 | 2,826 | 47,854,191.00 | 4,003,439.23 | 2,676 | 41,432,555.00 | 3,466,210.85 |
| 2026-08-05 | 3,456 | 62,093,187.00 | 5,194,661.02 | 3,357 | 60,783,953.00 | 5,085,131.66 |
| 2026-08-06 | 3,240 | 61,326,106.00 | 5,130,487.70 | 3,096 | 56,283,825.00 | 4,708,654.94 |
| 2026-08-07 | 3,271 | 61,633,105.00 | 5,156,170.96 | 3,110 | 58,915,279.00 | 4,928,800.05 |
| 2026-08-10 | 2,612 | 43,874,837.00 | 3,670,530.00 | 2,505 | 38,492,370.00 | 3,220,237.57 |
| 2026-08-11 | 3,419 | 58,023,910.00 | 4,854,228.91 | 2,308 | 37,091,292.00 | 3,103,024.63 |
| 2026-08-12 | 751 | 13,568,979.00 | 1,135,168.76 | 0 | 0.00 | 0.00 |

**观察**：工作日日均约 3,000–3,500 笔；08-11 成功金额明显低于前几日（成功笔数占比下降），08-12 尚处处理中。

---

## 4. 人民币折算方法

系统无逐笔锁定的 INR→CNY 字段。采用 `functional_exchange_rate`（GLOBAL / ENABLED）：

| 货币对 | sell_rate | 更新时间 |
| --- | ---: | --- |
| INR → USD | 0.012048 | 2026-02-05 |
| CNY → USD | 0.144013 | 2026-02-05 |

换算公式：

```text
CNY = INR × (INR→USD) / (CNY→USD)
    = INR × 0.012048 / 0.144013
    ≈ INR × 0.08365911
```

**推断 / 风险**：功能汇率最近更新于 2026-02-05，与 8 月实时市价可能存在偏差；本报告 CNY 为管理口径折算，不宜直接当作财务结算金额。若需财务级精度，待确认是否改用逐日市价或商户成交汇率。

---

## 5. 证据 SQL（脱敏）

目标：只读库；用途：汇总与分日统计。

```sql
-- 汇总
SELECT COUNT(*) AS order_cnt,
       SUM(transaction_amount) AS sum_inr,
       SUM(CASE WHEN order_status=0 THEN 1 ELSE 0 END) AS success_cnt,
       SUM(CASE WHEN order_status=0 THEN transaction_amount ELSE 0 END) AS success_inr,
       SUM(CASE WHEN order_status=1 THEN 1 ELSE 0 END) AS fail_cnt,
       SUM(CASE WHEN order_status=2 THEN 1 ELSE 0 END) AS processing_cnt
FROM cl_offline_admin.payout_order
WHERE create_time >= '2026-08-01'
  AND create_time < '2026-08-13';

-- 分日
SELECT DATE(create_time) AS dt,
       COUNT(*) AS cnt,
       SUM(transaction_amount) AS sum_inr,
       ROUND(SUM(transaction_amount)*0.012048/0.144013,2) AS sum_cny,
       SUM(CASE WHEN order_status=0 THEN 1 ELSE 0 END) AS success_cnt,
       ROUND(SUM(CASE WHEN order_status=0 THEN transaction_amount ELSE 0 END),2) AS success_inr,
       ROUND(SUM(CASE WHEN order_status=0 THEN transaction_amount ELSE 0 END)*0.012048/0.144013,2) AS success_cny
FROM cl_offline_admin.payout_order
WHERE create_time >= '2026-08-01'
  AND create_time < '2026-08-13'
GROUP BY DATE(create_time)
ORDER BY dt;
```

---

## 6. 待确认

1. 业务上「代发订单」是否仅统计成功单，还是含失败/处理中（本报告默认全量 + 另列成功）。
2. 人民币是否需改用当日市价 / 商户侧汇率，而非功能汇率。
3. 08-01 / 08-08 / 08-09 无单是否符合业务预期（周末停发）。
4. 报告归档责任人与分发对象。

---

## 7. 可视化

交互分析画布（可在 Cursor 侧边打开）：`canvases/payout-orders-aug2026.canvas.tsx`
