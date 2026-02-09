// ==UserScript==
// @name         Puzzle Auto Solver
// @namespace    puzzle.inject.solve
// @description xxx
// @version      1.0
// @match https://www.skyey2.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  function autoSolve() {
    if (!window.mainPuzzle || !mainPuzzle.piecesStart) {
      console.log('Puzzle not ready yet');
      return;
    }

    // const keep = mainPuzzle.piecesEnd;
    const keep = mainPuzzle.piecesStart;

    let solved = 0;
    let p = mainPuzzle.piecesStart;

    while (p) {
      if (p !== keep && !p.inPlace) {
        p.x = p.gridX * p.size - p.size * 0.2;
        p.y = p.gridY * p.size - p.size * 0.2;
        p.r = 0;
        p.inPlace = true;
        solved++;
      }
      p = p.next;
    }

    // 最多只加到 totalPieces - 1
    mainPuzzle.piecesInPlace = Math.min(
      mainPuzzle.piecesInPlace + solved,
      mainPuzzle.totalPieces - 1,
    );

    window.hasChanged = true;

    console.log('✔ Auto-solved except last piece');
  }

  // 暴露到 window，方便手动 / 远程调用
  window.__PUZZLE_AUTO_SOLVE__ = autoSolve;

  // 也可以延迟自动执行
  setTimeout(autoSolve, 2000);
})();
