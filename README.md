# 磯子周辺 花火見え方マップ

磯子駅周辺・磯子区・杉田・岡村・滝頭・根岸周辺から見える可能性がある花火大会/観覧候補を、確度付きで地図化する GitHub Pages 向け静的サイトです。

## MVP機能

- Leaflet + OpenStreetMap の地図
- `data/spots.json` の観覧候補ピン表示
- `data/events.json` の花火大会別フィルター
- 確度フィルター: `confirmed` / `likely` / `possible`
- 子連れ・ベビーカー簡易フィルター
- ピン詳細ポップアップ
- スポットから打上地点への方角線
- 住宅地・私有地を避ける注意表示

## 重要ルール

- 私有地やマンション敷地内にピンを刺さない
- 住宅地では正確すぎるピンを避け、`area` / `rough` / `private_avoid` を使う
- 見えると断定しない
- ソースURLを必ず保存する
- 口コミ・個人ブログは低確度から始める
- 新情報は直接JSONに反映せず、Issueまたは `research/candidates.md` で人間確認する

## ローカル確認

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

## データ仕様

### `data/spots.json`

- `pin_accuracy`
  - `exact`: 公園や公開展望台など、ピンポイントで出してよい
  - `area`: 周辺エリアとしてぼかす
  - `rough`: かなり曖昧
  - `private_avoid`: 私有地に近いため正確な位置非表示
- `confidence`
  - `confirmed`: 確認済み
  - `likely`: 有力
  - `possible`: 要検証

### `data/events.json`

打上地点は概略座標です。年度ごとの公式情報で必ず更新してください。

## GitHub Pages

リポジトリ Settings → Pages → Source を `Deploy from a branch`、Branch を `main` / `/ (root)` に設定します。

## 定期調査運用

- 通常期: 月1
- 5〜8月: 週1
- 花火大会2週間前: 週2〜3
- 当日: 手動確認

GitHub Actions の `scheduled-research-issue.yml` は、調査を促すIssueを定期作成します。Hermesで実調査する場合は `research/research-prompt.md` をプロンプトに使い、結果をIssueとして投稿してください。
