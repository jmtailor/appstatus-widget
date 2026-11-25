# AppStatusWidget

앱 개발 현황을 보여주는 Windows 데스크톱 위젯 (Electron).
왼쪽 "다음 단계" 타일 + 오른쪽 도넛/변화 기록. 코너 고정, 투명도 조절, 항상 위.

- 초록 빌드됨 · 노랑 베타 · 빨강 코드 없음 · 보라 계획
- 실시간 수집: Google Drive 동기화 폴더 변경 감시(fs.watch) + GitHub 저장소 푸시/릴리스 폴링
- 트레이 아이콘: 표시/숨김, 위치, 마우스 통과, 종료

## 실행
    npm install
    npm start

## 설정
위젯 ⚙ 버튼: 투명도, 위치, Create APP 폴더 경로, GitHub 토큰(선택), 갱신 주기.
앱 목록은 `%APPDATA%\AppStatusWidget\apps.json` (⚙ → 앱 목록 파일 열기)에서 수정.
각 앱의 `folder`(Create APP 기준 하위 폴더)와 `repo`(owner/name)를 채우면 자동 수집됩니다.

## 배포
태그를 푸시하면 GitHub Actions가 Windows 설치 파일을 만들어 Releases에 올립니다.

    git tag v0.1.0 && git push origin v0.1.0
