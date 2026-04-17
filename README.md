
# 年休管理ノート

ブラウザで使うシンプルな年休管理アプリです。JSON ファイルを開いて、年休の取得履歴や設定をそのまま編集できます。

## このアプリの取得方法

### 方法1: zipをダウンロードして使う（Git不要）

1. 配布された zip ファイルをダウンロード
2. 任意のフォルダに解凍
3. 解凍されたフォルダ内の `Nenkyu.html` を開く

### 方法2: Gitでクローン（Git使用者向け）

```bash
git clone <リポジトリURL>
cd <フォルダ名>
```

その後 `Nenkyu.html` を開く

### 方法3: ファイルを直接コピー

以下のファイルを同一フォルダに配置

* `Nenkyu.html`
* `Nenkyu.css`
* `Nenkyu.js`

## できること

* JSON ファイルを開いて年休データを編集
* 前回開いていたファイルを復元
* 全休 / 時間休の記録追加・編集・削除
* 各記録にメモを残して、あとから理由を見返す
* 残り時間、残り日数、期限までの日数の確認
* 月別の取得時間の可視化
* 昼休憩控除を含む時間休計算

## ファイル構成

* `Nenkyu.html`: 画面のマークアップ
* `Nenkyu.css`: レイアウトとスタイル
* `Nenkyu.js`: 状態管理、描画、入力処理、ファイル操作
* `nenkyuu.json`: サンプルデータ

## 使い方

1. `Nenkyu.html` を Edge / Chrome などで開く
2. 初期画面で `ファイルを開く`、`新規作成`、または `前回のデータを復元` を選ぶ
3. 記録や設定を編集する
4. 保存は JSON ファイルへ自動反映される

## ローカルサーバーで開く方法

`file://` で不安定な場合は以下の方法を使用

### 方法A: Python

```bash
cd フォルダパス
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開く

### 方法B: Node.js

```bash
npx serve
```

表示されたURLを開く

### 方法C: VSCode

* 拡張機能「Live Server」をインストール
* `Nenkyu.html` を右クリック → 「Open with Live Server」

## データ形式

現在の保存形式は次のような構造です。

```json
{
  "version": 2,
  "settings": {
    "totalDays": 11,
    "hoursPerDay": 7,
    "deadline": "2027-03-31",
    "deductLunchBreak": true,
    "lunchStart": "12:00",
    "lunchEnd": "12:45"
  },
  "entries": [
    {
      "id": "uuid",
      "date": "2026-04-22",
      "type": "partial",
      "startTime": "15:30",
      "endTime": "16:15",
      "note": "病院の予約"
    }
  ]
}
```

* `version`: データ形式のバージョン
* `settings`: 年休計算に使う設定
* `entries`: 取得履歴
* `note`: 各記録の補足メモ

補足:

* 旧形式の `records` 配列も読み込み可能
* `type` は `full` または `partial`
* `full` の場合は `startTime` / `endTime` は `null` 可

## 保存と復元

* File System Access API を使って JSON を直接読み書き
* 前回開いたファイルのハンドルは IndexedDB に保存
* 復元時はブラウザの権限状態によって再許可が必要

## 注意

* `file://` での動作が不安定な場合あり
* Chromium系ブラウザ推奨
