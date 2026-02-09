//***Puzzle Script by Josh***
//Original: 2016-09-30
//Fixes and Cleanup: 2017-06-14

//*****GLOBALS******
//puzzle piece cutout coordinates
var cutoutCoords = [
  0, 0, 0.35, 0.15, 0.37, 0.05, 0.37, 0.05, 0.4, 0, 0.38, -0.05, 0.38, -0.05,
  0.2, -0.2, 0.5, -0.2, 0.5, -0.2, 0.8, -0.2, 0.62, -0.05, 0.62, -0.05, 0.6, 0,
  0.63, 0.05, 0.63, 0.05, 0.65, 0.15, 1, 0,
];

//maincanvas object, 2D context, loaded image
var maincanvas, context, img;

//main puzzle object
var mainPuzzle;

//image scale
var mainScale = 1.0;
//piece size
var mainPieceSize = 50;
//image url
//var imageurl = "colorful-scaled.jpg";

//flags
var dragging = false;
var rotateKeysDown = 0;
var rotateKeysstat = 0;
var animStart = null;
var hasChanged = false;

//keep track of the image to speed up drawing
var backingCanvas = null;
var backingContext = null;
//first frame after drag we need to snapshot
var firstDrag = true;

//local storage check
var canUseLocalStorage = false;

//variables for final animation
var isDone = false;
var finalState = '';
var finalWipePos = 0;

//check if this browser supports html5 storage
function supports_html5_storage() {
  try {
    if ('localStorage' in window && window['localStorage'] !== null) {
      localStorage.setItem('puzzleTest', '');
      return true;
    }
  } catch (e) {
    return false;
  }
}

//puzzle class
function puzzle() {
  //stacking order list heads
  this.piecesStart = null;
  this.piecesEnd = null;

  //scorekeeping
  this.totalPieces = 0;
  this.piecesInPlace = 0;

  //width/height of all pieces
  this.pieceSize = 0;
  //total cols/rows of puzzle
  this.columns = 0;
  this.rows = 0;

  this.wasLoaded = false;

  //in: source image, source image scale, piece size
  this.buildPieces = function (img, scale, pieceSize) {
    //save piece size
    this.pieceSize = pieceSize;

    //calculate piece count for size/scale
    this.columns = Math.floor((img.width * scale) / this.pieceSize);
    this.rows = Math.floor((img.height * scale) / this.pieceSize);
    this.totalPieces = this.columns * this.rows;

    //list keeper
    var cur_p = null;
    //hold position array for speed
    var piecePositions = [];

    //over cols by rows
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.columns; x++) {
        var p = new puzzlePiece();
        //default in place with 0 rotation
        p.x = x * pieceSize;
        p.y = y * pieceSize;
        p.r = 0;
        p.size = pieceSize;
        //image grid position
        p.gridX = x;
        p.gridY = y;

        //default sides
        p.edges = [0, 0, 0, 0];
        //count in and out sides to prevent 4 same sides
        var edge_count = 0;
        //if not top edge then match opposite of piece above
        if (y != 0) {
          p.edges[0] = piecePositions[(y - 1) * this.columns + x].edges[2] * -1;
          edge_count += p.edges[0];
        }
        //if not right edge then random side on right
        if (x != this.columns - 1) {
          p.edges[1] = Math.random() < 0.5 ? -1 : 1;
          edge_count += p.edges[1];
        }
        //if not bottom edge then random side on bottom
        if (y != this.rows - 1) {
          //if 2 or more edges in or out then force the opposite otherwise oppsite
          if (Math.abs(edge_count) == 2) p.edges[2] = -1 * (edge_count / 2);
          else p.edges[2] = Math.random() < 0.5 ? -1 : 1;
        }
        //if not left edge then match opposite of piece to left
        if (x != 0) {
          p.edges[3] = piecePositions[y * this.columns + (x - 1)].edges[1] * -1;
        }
        //calc bounds
        p.calculateBoundries();
        //create piece image
        p.createImage(img, scale);
        //add to layer list
        if (this.piecesStart == null) {
          this.piecesStart = p;
          this.piecesEnd = p;
        } else {
          this.piecesStart.prev = p;
          p.next = this.piecesStart;
          this.piecesStart = p;
        }
        //add to temp position array
        piecePositions.push(p);
      }
    }
  };

  //shuffle pieces within bounds
  this.shufflePieces = function (maxX, maxY) {
    //step through list set random position and rotation within bounds
    var p = this.piecesStart;
    var temp_list = [];
    while (p != null) {
      if (!p.inPlace) {
        p.x = Math.floor(Math.random() * (maxX - p.size * 1.4) + 0.2 * p.size);
        p.y = Math.floor(Math.random() * (maxY - p.size * 1.4) + 0.2 * p.size);
        p.r = Math.random() * (Math.PI * 1.9);
        //create temporary array of pieces
        temp_list.push(p);
      }
      p = p.next;
    }
    p = this.piecesStart;
    while (p != null) {
      if (p.inPlace) temp_list.push(p);
      p = p.next;
    }
    //randomize layers for each piece
    for (var i = 0; i < temp_list.length; i++) {
      //pick random swap dest
      var dest = Math.floor(Math.random() * temp_list.length);
      if (!temp_list[dest].inPlace && !temp_list[i].inPlace) {
        var temp_piece = temp_list[i];
        temp_list[i] = temp_list[dest];
        temp_list[dest] = temp_piece;
      }
    }
    //rebuild linked list
    this.piecesStart = temp_list[0];
    this.piecesStart.prev = null;
    this.piecesStart.next = temp_list[1];
    this.piecesEnd = temp_list[temp_list.length - 1];
    this.piecesEnd.next = null;
    this.piecesEnd.prev = temp_list[temp_list.length - 2];
    for (var i = 1; i < temp_list.length - 1; i++) {
      temp_list[i].prev = temp_list[i - 1];
      temp_list[i].next = temp_list[i + 1];
    }
  };

  //find any pieces outside the bounds of the browser window and bring them in
  this.collectLostPieces = function (maxX, maxY) {
    var p = this.piecesStart;
    while (p != null) {
      if (!p.inPlace) {
        if (p.x < 0) p.x = 0;
        if (p.y < 0) p.y = 0;
        if (p.x + p.size * 1.4 > maxX) p.x = maxX - p.size * 1.4;
        if (p.y + p.size * 1.4 > maxY) p.y = maxY - p.size * 1.4;
      }
      p = p.next;
    }
  };

  //save the state of the puzzle to storage if we can use it
  this.saveState = function () {
    if (canUseLocalStorage) {
      //build array of piece positions/states
      var data = {
        imageurl: imageurl,
        scale: mainScale,
        size: mainPieceSize,
        pieces: [],
      };
      var p = this.piecesStart;
      while (p != null) {
        data.pieces.push([
          p.x,
          p.y,
          p.r,
          p.size,
          p.gridX,
          p.gridY,
          p.inPlace,
          p.edges[0],
          p.edges[1],
          p.edges[2],
          p.edges[3],
        ]);
        p = p.next;
      }
      //window.localStorage["puzzleState"] = JSON.stringify(data);
      localStorage.setItem('puzzleState', JSON.stringify(data));
    }
  };

  //load the state of the puzzle from storage if we can use it
  this.loadState = function (img, scale, pieceSize) {
    if (canUseLocalStorage) {
      var json_data = localStorage.getItem('puzzleState');
      if (json_data != null && json_data.length > 0) {
        var data = JSON.parse(json_data);
        //check if data is valid
        if (
          data.size != mainPieceSize ||
          data.scale != mainScale ||
          data.imageurl != imageurl
        ) {
          //invalidate data
          localStorage.setItem('puzzleState', null);
          //not loaded
          this.wasLoaded = false;
          //cancel
          return;
        }
        this.pieceSize = data.pieces[0][3];
        this.columns = Math.floor((img.width * scale) / this.pieceSize);
        this.rows = Math.floor((img.height * scale) / this.pieceSize);
        for (var i = 0; i < data.pieces.length; i++) {
          var p = new puzzlePiece();
          //default in place with 0 rotation
          p.x = data.pieces[i][0];
          p.y = data.pieces[i][1];
          p.r = data.pieces[i][2];
          p.size = data.pieces[i][3];
          //image grid position
          p.gridX = data.pieces[i][4];
          p.gridY = data.pieces[i][5];
          p.inPlace = data.pieces[i][6];
          this.totalPieces++;
          if (p.inPlace) this.piecesInPlace++;
          p.edges = [
            data.pieces[i][7],
            data.pieces[i][8],
            data.pieces[i][9],
            data.pieces[i][10],
          ];
          //calc bounds
          p.calculateBoundries();
          //create piece image
          p.createImage(img, scale);
          //add to layer list
          if (this.piecesStart == null) {
            this.piecesStart = p;
            this.piecesEnd = p;
          } else {
            this.piecesEnd.next = p;
            p.next = null;
            p.prev = this.piecesEnd;
            this.piecesEnd = p;
          }
        }
        this.wasLoaded = true;
      }
    }
  };

  //solve the puzzle, easy mode!
}

//puzzle piece object
function puzzlePiece() {
  //position
  this.x = 0;
  this.y = 0;
  //rotation
  this.r = 0;
  //piece size
  this.size = 0;

  //depth list links
  this.prev = null;
  this.next = null;

  //image grid location
  this.gridX = 0;
  this.gridY = 0;

  //edge types
  this.edges = [0, 0, 0, 0];
  //edge bounds (x, y, w, h)
  this.bounds = [0, 0, 0, 0];

  //piece image
  this.image = null;

  //piece is set in it's place
  this.inPlace = false;

  this.lastDrawPosX = -999;
  this.lastDrawPosY = -999;
  this.lastDrawPosR = -999;

  this.calculateBoundries = function () {
    //calc boundries based on sides
    this.bounds[0] = 0;
    this.bounds[1] = 0;
    this.bounds[2] = this.size * 1.4;
    this.bounds[3] = this.size * 1.4;
    if (this.edges[3] == 0) this.bounds[0] = 0.2 * this.size;
    else if (this.edges[3] == -1) this.bounds[0] = 0.1 * this.size;
    this.bounds[2] -= this.bounds[0];
    if (this.edges[0] == 0) this.bounds[1] = 0.2 * this.size;
    else if (this.edges[0] == -1) this.bounds[1] = 0.1 * this.size;
    this.bounds[3] -= this.bounds[1];
    if (this.edges[1] == 0) this.bounds[2] -= 0.2 * this.size;
    else if (this.edges[1] == -1) this.bounds[2] -= 0.1 * this.size;
    if (this.edges[2] == 0) this.bounds[3] -= 0.2 * this.size;
    else if (this.edges[2] == -1) this.bounds[3] -= 0.1 * this.size;
  };

  //create this piece image
  this.createImage = function (img, scale) {
    //create canvas for piece
    this.image = document.createElement('canvas');
    this.image.width = this.size * 1.4;
    this.image.height = this.size * 1.4;
    //temporary context
    var tempctx = this.image.getContext('2d');
    tempctx.save();
    var local_offset = this.size * 0.2;
    tempctx.moveTo(local_offset, local_offset);
    //top mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] = local_offset + cutoutCoords[i * 6 + j * 2] * this.size;
        py[j] =
          local_offset +
          this.edges[0] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //right mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset +
          this.size +
          -this.edges[1] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
        py[j] = local_offset + cutoutCoords[i * 6 + j * 2] * this.size;
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //bottom mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset + this.size - cutoutCoords[i * 6 + j * 2] * this.size;
        py[j] =
          local_offset +
          this.size -
          this.edges[2] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //left mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset -
          -this.edges[3] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
        py[j] =
          local_offset + this.size - cutoutCoords[i * 6 + j * 2] * this.size;
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //clip draw area
    tempctx.clip();
    //draw image to temp context
    //console.log((((this.gridX * this.size) - local_offset) / scale) + "," + (((this.gridY * this.size) - local_offset) / scale) + "," + (((this.size * 1.4) / scale) + "," + (this.size * 1.4) / scale) + ", 0, 0, " + (this.size * 1.4) + "," + (this.size * 1.4));
    var tempx = this.gridX * this.size - local_offset;
    var tempx2 = 0;
    var tempy = this.gridY * this.size - local_offset;
    var tempy2 = 0;
    if (tempx < 0) {
      tempx2 = Math.abs(tempx);
      tempx = 0;
    }
    if (tempy < 0) {
      tempy2 = Math.abs(tempy);
      tempy = 0;
    }
    tempctx.drawImage(
      img,
      tempx / scale,
      tempy / scale,
      (this.size * 1.4) / scale,
      (this.size * 1.4) / scale,
      tempx2,
      tempy2,
      this.size * 1.4,
      this.size * 1.4,
    );
    tempctx.restore();
    //free context
    tempctx = null;
  };

  //is in bounds of this piece
  this.inBounds = function (context, cx, cy) {
    if (
      cx > this.x &&
      cy > this.y &&
      cx < this.x + this.size * 1.4 &&
      cy < this.y + this.size * 1.4
    )
      return true;
    return false;
  };
}

//initialize the puzzle and set things up
function init() {
  //check for local storage
  canUseLocalStorage = supports_html5_storage();
  if (!canUseLocalStorage)
    alert(
      "Your browser won't allow local storage for this page!\nAll progress will be lost if the page is closed or reloaded.",
    );
  //grab canvas
  maincanvas = document.getElementById('maincanvas');
  //get context
  context = maincanvas.getContext('2d');
  //create backing canvas
  backingCanvas = document.createElement('canvas');
  backingContext = backingCanvas.getContext('2d');

  //create puzzle object
  mainPuzzle = new puzzle();
  //image object
  img = document.createElement('img');
  //attach a callback and load
  img.onload = imageLoaded;
  //load

  //check url params for a custom image and options
  var param1 = window.location.search.split('?');
  if (0 && param1.length > 1) {
    var param2 = param1[1].split('&');
    for (var i = 0; i < param2.length; i++) {
      var param3 = param2[i].split('=');
      if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'img' &&
        param3[1] != ''
      ) {
        imageurl = decodeURIComponent(param3[1]);
      } else if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'scale' &&
        param3[1] != ''
      ) {
        mainScale = parseFloat(param3[1]);
      } else if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'size' &&
        param3[1] != ''
      ) {
        mainPieceSize = parseFloat(param3[1]);
      }
    }
  }
  img.src = imageurl;
}

//redraw scene function
function redraw() {
  if (isDone) {
    if (finalState == 'wipe' && finalWipePos > 0) {
      //console.log(finalWipePos);
      context.save();
      context.shadowOffsetX = 10;
      context.shadowBlur = 5;
      context.shadowColor = '#CCCCCC';

      context.drawImage(
        img,
        0,
        0,
        finalWipePos / mainScale,
        (mainPuzzle.rows * mainPuzzle.pieceSize) / mainScale,
        0,
        0,
        finalWipePos,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.restore();

      context.strokeStyle = 'black';
      context.lineWidth = 2;
      context.strokeRect(
        1,
        1,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
    }
    if (finalState == 'fixeddialog' || finalState == 'fixed') {
      context.fillStyle = 'white';
      context.fillRect(0, 0, maincanvas.width, maincanvas.height);
      context.drawImage(
        img,
        0,
        0,
        (mainPuzzle.columns * mainPuzzle.pieceSize) / mainScale,
        (mainPuzzle.rows * mainPuzzle.pieceSize) / mainScale,
        0,
        0,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.strokeStyle = 'black';
      context.lineWidth = 2;
      context.strokeRect(
        1,
        1,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.font = '12pt Arial';
      context.textBaseline = 'top';
      context.fillStyle = 'black';
      context.fillText(
        'A/D = Rotate Piece  |  C = Find Lost Pieces  |  R = Re-shuffle Remaining Pieces  |  N = Start Over',
        5,
        mainPuzzle.rows * mainPuzzle.pieceSize + 5,
      );
    }
  } else if (dragging && !firstDrag) {
    var p = mainPuzzle.piecesStart;
    //redraw background in an inefficient way but safe and easy
    context.drawImage(
      backingCanvas,
      p.lastDrawPosX - 5,
      p.lastDrawPosY - 5,
      p.size * 1.4 + 15,
      p.size * 1.4 + 15,
      p.lastDrawPosX - 5,
      p.lastDrawPosY - 5,
      p.size * 1.4 + 15,
      p.size * 1.4 + 15,
    );

    //draw top piece
    context.save();
    context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

    context.rotate(p.r);
    //drop shadow if not in place
    if (!p.inPlace) {
      context.shadowColor = '#000000';
      context.shadowBlur = 5;
      context.shadowOffsetX = 3;
      context.shadowOffsetY = 3;
    }
    //draw piece to scene
    context.drawImage(
      p.image,
      -1 * ((p.size * 1.4) / 2),
      -1 * ((p.size * 1.4) / 2),
    );
    context.restore();
    p.lastDrawPosX = p.x;
    p.lastDrawPosY = p.y;
    p.lastDrawPosR = p.r;
  } else {
    //clear background
    context.fillStyle = 'white';
    context.fillRect(0, 0, maincanvas.width, maincanvas.height);
    //draw puzzle bounding box
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.strokeRect(
      1,
      1,
      mainPuzzle.columns * mainPuzzle.pieceSize,
      mainPuzzle.rows * mainPuzzle.pieceSize,
    );
    context.font = '12pt Arial';
    context.textBaseline = 'top';
    context.fillStyle = 'black';
    context.fillText(
      'A/D = Rotate Piece  |  C = Find Lost Pieces  |  R = Re-shuffle Remaining Pieces  |  N = Start Over',
      5,
      mainPuzzle.rows * mainPuzzle.pieceSize + 5,
    );

    var p = mainPuzzle.piecesEnd;
    //draw bottom to top except the top piece
    while (p.prev != null) {
      context.save();

      context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

      context.rotate(p.r);
      //drop shadow if not in place
      if (!p.inPlace) {
        context.shadowColor = '#000000';
        context.shadowBlur = 5;
        context.shadowOffsetX = 3;
        context.shadowOffsetY = 3;
      }
      //draw piece to scene
      context.drawImage(
        p.image,
        -1 * ((p.size * 1.4) / 2),
        -1 * ((p.size * 1.4) / 2),
      );
      context.restore();

      p.lastDrawPosX = p.x;
      p.lastDrawPosY = p.y;
      p.lastDrawPosR = p.r;

      p = p.prev;
    }

    //snapshot current view minus top piece
    backingContext.drawImage(maincanvas, 0, 0);

    //draw top piece
    context.save();

    context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

    context.rotate(p.r);
    context.strokeStyle = 'black';
    //drop shadow if not in place
    if (!p.inPlace) {
      context.shadowColor = '#000000';
      context.shadowBlur = 5;
      context.shadowOffsetX = 3;
      context.shadowOffsetY = 3;
    }
    //draw piece to scene
    context.drawImage(
      p.image,
      -1 * ((p.size * 1.4) / 2),
      -1 * ((p.size * 1.4) / 2),
    );
    context.restore();
    p.lastDrawPosX = p.x;
    p.lastDrawPosY = p.y;
    p.lastDrawPosR = p.r;

    if (dragging) firstDrag = false;
  }
}

//***callbacks***
//browser window resize
function onResize() {
  maincanvas.style.width = window.innerWidth - 10;
  maincanvas.style.height = window.innerHeight - 10;
  //adjust canvas to match canvas element
  maincanvas.width = window.innerWidth - 10;
  maincanvas.height = window.innerHeight - 10;

  //adjust the backing canvas to match the main
  backingCanvas.width = maincanvas.width;
  backingCanvas.height = maincanvas.height;

  if (mainPuzzle != null)
    mainPuzzle.collectLostPieces(maincanvas.width, maincanvas.height);
  hasChanged = true;
}

//main image loaded
function imageLoaded() {
  //attempt load puzzle state
  if (canUseLocalStorage) mainPuzzle.loadState(img, mainScale, mainPieceSize);

  //generate puzzle pieces if not loaded state
  if (!mainPuzzle.wasLoaded)
    mainPuzzle.buildPieces(img, mainScale, mainPieceSize);

  //resize canvas width/height
  onResize();
  if (!mainPuzzle.wasLoaded) {
    mainPuzzle.shufflePieces(maincanvas.width - 10, maincanvas.height - 10);
    mainPuzzle.saveState();
  } else {
    if (mainPuzzle.piecesInPlace == mainPuzzle.totalPieces) {
      isDone = true;
      finalState = 'fixed';
    }
  }
  //catch future window resize events
  window.addEventListener('resize', onResize, false);

  //controls callbacks
  maincanvas.addEventListener('mousedown', onMouseDown, false);
  maincanvas.addEventListener('mouseup', onMouseUp, false);
  maincanvas.addEventListener('mousemove', onMouseMove, false);
  maincanvas.addEventListener('touchstart', onTouchDown, false);
  maincanvas.addEventListener('touchend', onTouchUp, false);
  maincanvas.addEventListener('touchmove', onTouchMove, false);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  //start main loop
  hasChanged = true;
  requestAnimationFrame(animate);
}

//mouse move, move piece and update
function onMouseMove(event) {
  if (dragging) {
    mainPuzzle.piecesStart.x = event.clientX - (mainPuzzle.pieceSize * 1.4) / 2;
    mainPuzzle.piecesStart.y = event.clientY - (mainPuzzle.pieceSize * 1.4) / 2;
    hasChanged = true;
  }
}
function onTouchMove(event) {
  let touch = event.touches[0];
  if (touch) {
    mainPuzzle.piecesStart.x = touch.clientX - (mainPuzzle.pieceSize * 1.4) / 2;
    mainPuzzle.piecesStart.y = touch.clientY - (mainPuzzle.pieceSize * 1.4) / 2;
    hasChanged = true;
  }
}

//key down, if dragging then rotate and update
function onKeyDown(event) {
  if (dragging) {
    if (event.keyCode == 65) {
      rotateKeysDown = -1;
      hasChanged = true;
    }
    if (event.keyCode == 68) {
      rotateKeysDown = 1;
      hasChanged = true;
    }
  }
}

//key up, stop rotating if we were or trigger single press events
function onKeyUp(event) {
  if (event.keyCode == 65 && rotateKeysDown == -1) rotateKeysDown = 0;
  if (event.keyCode == 68 && rotateKeysDown == 1) rotateKeysDown = 0;
  if (event.keyCode == 82) {
    mainPuzzle.shufflePieces(maincanvas.width, maincanvas.height);
    hasChanged = true;
  }
  if (event.keyCode == 67) {
    mainPuzzle.collectLostPieces(maincanvas.width, maincanvas.height);
    hasChanged = true;
  }
  if (event.keyCode == 78) {
    var res = confirm('Are you sure you want to reset the puzzle?');
    if (res) {
      if (canUseLocalStorage) localStorage.setItem('puzzleState', null);
      var p = mainPuzzle.piecesStart;
      while (p.next != null) {
        p.inPlace = false;
        p = p.next;
      }
      mainPuzzle.piecesInPlace = 0;
      mainPuzzle.shufflePieces(maincanvas.width - 10, maincanvas.height - 10);
      isDone = false;
      finalState = '';
      finalWipePos = 0;
      hasChanged = true;
    }
  }
}

//mouse down, start dragging
function onMouseDown(event) {
  var curDrag = null;
  var p = mainPuzzle.piecesStart;
  //find piece to drag
  while (curDrag == null && p != null) {
    if (!p.inPlace && p.inBounds(context, event.clientX, event.clientY)) {
      curDrag = p;
    }
    p = p.next;
  }
  if (curDrag == null) return;
  //set this piece as dragging
  dragPiece = curDrag;
  //if found move to top of list
  if (curDrag.prev != null) {
    curDrag.prev.next = curDrag.next;
    if (curDrag.next != null) curDrag.next.prev = curDrag.prev;
    else mainPuzzle.piecesEnd = curDrag.prev;
    mainPuzzle.piecesStart.prev = curDrag;
    curDrag.next = mainPuzzle.piecesStart;
    curDrag.prev = null;
    mainPuzzle.piecesStart = curDrag;
  }
  dragging = true;
  firstDrag = true;
}
function onTouchDown(event) {
  rotateKeysDown = 0;

  if (rotateKeysstat != 1) {
    rotateKeysDown = 1;
    rotateKeysstat = 1;
  } else {
    rotateKeysDown = -1;
    rotateKeysstat = 0;
  }
  var curDrag = null;
  var p = mainPuzzle.piecesStart;
  let touch = event.touches[0];
  //find piece to drag
  while (curDrag == null && p != null) {
    if (!p.inPlace && p.inBounds(context, touch.clientX, touch.clientY)) {
      curDrag = p;
    }
    p = p.next;
  }
  if (curDrag == null) return;
  //set this piece as dragging
  dragPiece = curDrag;
  //if found move to top of list
  if (curDrag.prev != null) {
    curDrag.prev.next = curDrag.next;
    if (curDrag.next != null) curDrag.next.prev = curDrag.prev;
    else mainPuzzle.piecesEnd = curDrag.prev;
    mainPuzzle.piecesStart.prev = curDrag;
    curDrag.next = mainPuzzle.piecesStart;
    curDrag.prev = null;
    mainPuzzle.piecesStart = curDrag;
  }
  dragging = true;
  firstDrag = true;
}
//stop dragging
function onMouseUp(event) {
  dragging = false;
  dragPiece = null;
}
function onTouchUp(event) {
  rotateKeysDown = 0;
  dragging = false;
  dragPiece = null;
}

//main animation function
function animate(timestamp) {
  if (animStart == null) animStart = timestamp;
  var timeSince = timestamp - animStart;
  animStart = timestamp;

  if (isDone) {
    if (finalState == 'wipe') {
      finalWipePos += 30 * (timeSince / 100);
      if (finalWipePos > mainPuzzle.columns * mainPuzzle.pieceSize) {
        finalWipePos = mainPuzzle.columns * mainPuzzle.pieceSize;
        finalState = 'fixeddialog';
      }
      hasChanged = true;
    } else if (finalState == 'fixeddialog') {
      alert('Congratulations!\nYou solved the puzzle!');
      finalState = 'fixed';
    }
    if (finalState == 'shimmer') {
      //fix this
    }
  } else {
    //check all pieces in place
    if (mainPuzzle.piecesInPlace == mainPuzzle.totalPieces) {
      isDone = true;
      finalState = 'wipe';
      finalWipePos = 0;
    } else {
      var top_piece = mainPuzzle.piecesStart;
      if (dragging) {
        top_piece.r += rotateKeysDown * 0.25 * (timeSince / 100);
        while (top_piece.r > Math.PI * 2.0) top_piece.r -= Math.PI * 2.0;
        while (top_piece.r < 0) top_piece.r += Math.PI * 2.0;
        hasChanged = true;
      } else {
        //check if top piece in place with some margin for error
        var targetX = top_piece.gridX * top_piece.size - top_piece.size * 0.2;
        var targetY = top_piece.gridY * top_piece.size - top_piece.size * 0.2;

        if (
          top_piece.x > targetX - 10 &&
          top_piece.x < targetX + 10 &&
          top_piece.y > targetY - 10 &&
          top_piece.y < targetY + 10 &&
          (top_piece.r > Math.PI * 1.9 || top_piece.r < 0.2)
        ) {
          top_piece.x = targetX;
          top_piece.y = targetY;
          top_piece.r = 0;
          top_piece.inPlace = true;
          mainPuzzle.piecesInPlace++;

          //move to bottom
          var p = mainPuzzle.piecesStart;
          mainPuzzle.piecesStart = p.next;
          mainPuzzle.piecesStart.prev = null;
          p.prev = mainPuzzle.piecesEnd;
          mainPuzzle.piecesEnd.next = p;
          p.next = null;
          mainPuzzle.piecesEnd = p;
          hasChanged = true;
        }
        if (hasChanged) mainPuzzle.saveState();
      }
    }
  }

  if (hasChanged) {
    redraw();
    hasChanged = false;
  }
  requestAnimationFrame(animate);
} //***Puzzle Script by Josh***
//Original: 2016-09-30
//Fixes and Cleanup: 2017-06-14

//*****GLOBALS******
//puzzle piece cutout coordinates
var cutoutCoords = [
  0, 0, 0.35, 0.15, 0.37, 0.05, 0.37, 0.05, 0.4, 0, 0.38, -0.05, 0.38, -0.05,
  0.2, -0.2, 0.5, -0.2, 0.5, -0.2, 0.8, -0.2, 0.62, -0.05, 0.62, -0.05, 0.6, 0,
  0.63, 0.05, 0.63, 0.05, 0.65, 0.15, 1, 0,
];

//maincanvas object, 2D context, loaded image
var maincanvas, context, img;

//main puzzle object
var mainPuzzle;

//image scale
var mainScale = 1.0;
//piece size
var mainPieceSize = 120;
//image url
//var imageurl = "";

//flags
var dragging = false;
var rotateKeysDown = 0;
var animStart = null;
var hasChanged = false;

//keep track of the image to speed up drawing
var backingCanvas = null;
var backingContext = null;
//first frame after drag we need to snapshot
var firstDrag = true;

//local storage check
var canUseLocalStorage = false;

//variables for final animation
var isDone = false;
var finalState = '';
var finalWipePos = 0;

//check if this browser supports html5 storage
function supports_html5_storage() {
  try {
    if ('localStorage' in window && window['localStorage'] !== null) {
      localStorage.setItem('puzzleTest', '');
      return true;
    }
  } catch (e) {
    return false;
  }
}

//puzzle class
function puzzle() {
  //stacking order list heads
  this.piecesStart = null;
  this.piecesEnd = null;

  //scorekeeping
  this.totalPieces = 0;
  this.piecesInPlace = 0;

  //width/height of all pieces
  this.pieceSize = 0;
  //total cols/rows of puzzle
  this.columns = 0;
  this.rows = 0;

  this.wasLoaded = false;

  //in: source image, source image scale, piece size
  this.buildPieces = function (img, scale, pieceSize) {
    //save piece size
    this.pieceSize = pieceSize;

    //calculate piece count for size/scale
    this.columns = Math.floor((img.width * scale) / this.pieceSize);
    this.rows = Math.floor((img.height * scale) / this.pieceSize);
    this.totalPieces = this.columns * this.rows;

    //list keeper
    var cur_p = null;
    //hold position array for speed
    var piecePositions = [];

    //over cols by rows
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.columns; x++) {
        var p = new puzzlePiece();
        //default in place with 0 rotation
        p.x = x * pieceSize;
        p.y = y * pieceSize;
        p.r = 0;
        p.size = pieceSize;
        //image grid position
        p.gridX = x;
        p.gridY = y;

        //default sides
        p.edges = [0, 0, 0, 0];
        //count in and out sides to prevent 4 same sides
        var edge_count = 0;
        //if not top edge then match opposite of piece above
        if (y != 0) {
          p.edges[0] = piecePositions[(y - 1) * this.columns + x].edges[2] * -1;
          edge_count += p.edges[0];
        }
        //if not right edge then random side on right
        if (x != this.columns - 1) {
          p.edges[1] = Math.random() < 0.5 ? -1 : 1;
          edge_count += p.edges[1];
        }
        //if not bottom edge then random side on bottom
        if (y != this.rows - 1) {
          //if 2 or more edges in or out then force the opposite otherwise oppsite
          if (Math.abs(edge_count) == 2) p.edges[2] = -1 * (edge_count / 2);
          else p.edges[2] = Math.random() < 0.5 ? -1 : 1;
        }
        //if not left edge then match opposite of piece to left
        if (x != 0) {
          p.edges[3] = piecePositions[y * this.columns + (x - 1)].edges[1] * -1;
        }
        //calc bounds
        p.calculateBoundries();
        //create piece image
        p.createImage(img, scale);
        //add to layer list
        if (this.piecesStart == null) {
          this.piecesStart = p;
          this.piecesEnd = p;
        } else {
          this.piecesStart.prev = p;
          p.next = this.piecesStart;
          this.piecesStart = p;
        }
        //add to temp position array
        piecePositions.push(p);
      }
    }
  };

  //shuffle pieces within bounds
  this.shufflePieces = function (maxX, maxY) {
    //step through list set random position and rotation within bounds
    var p = this.piecesStart;
    var temp_list = [];
    while (p != null) {
      if (!p.inPlace) {
        p.x = Math.floor(Math.random() * (maxX - p.size * 1.4) + 0.2 * p.size);
        p.y = Math.floor(Math.random() * (maxY - p.size * 1.4) + 0.2 * p.size);
        p.r = Math.random() * (Math.PI * 1.9);
        //create temporary array of pieces
        temp_list.push(p);
      }
      p = p.next;
    }
    p = this.piecesStart;
    while (p != null) {
      if (p.inPlace) temp_list.push(p);
      p = p.next;
    }
    //randomize layers for each piece
    for (var i = 0; i < temp_list.length; i++) {
      //pick random swap dest
      var dest = Math.floor(Math.random() * temp_list.length);
      if (!temp_list[dest].inPlace && !temp_list[i].inPlace) {
        var temp_piece = temp_list[i];
        temp_list[i] = temp_list[dest];
        temp_list[dest] = temp_piece;
      }
    }
    //rebuild linked list
    this.piecesStart = temp_list[0];
    this.piecesStart.prev = null;
    this.piecesStart.next = temp_list[1];
    this.piecesEnd = temp_list[temp_list.length - 1];
    this.piecesEnd.next = null;
    this.piecesEnd.prev = temp_list[temp_list.length - 2];
    for (var i = 1; i < temp_list.length - 1; i++) {
      temp_list[i].prev = temp_list[i - 1];
      temp_list[i].next = temp_list[i + 1];
    }
  };

  //find any pieces outside the bounds of the browser window and bring them in
  this.collectLostPieces = function (maxX, maxY) {
    var p = this.piecesStart;
    while (p != null) {
      if (!p.inPlace) {
        if (p.x < 0) p.x = 0;
        if (p.y < 0) p.y = 0;
        if (p.x + p.size * 1.4 > maxX) p.x = maxX - p.size * 1.4;
        if (p.y + p.size * 1.4 > maxY) p.y = maxY - p.size * 1.4;
      }
      p = p.next;
    }
  };

  //save the state of the puzzle to storage if we can use it
  this.saveState = function () {
    if (canUseLocalStorage) {
      //build array of piece positions/states
      var data = {
        imageurl: imageurl,
        scale: mainScale,
        size: mainPieceSize,
        pieces: [],
      };
      var p = this.piecesStart;
      while (p != null) {
        data.pieces.push([
          p.x,
          p.y,
          p.r,
          p.size,
          p.gridX,
          p.gridY,
          p.inPlace,
          p.edges[0],
          p.edges[1],
          p.edges[2],
          p.edges[3],
        ]);
        p = p.next;
      }
      //window.localStorage["puzzleState"] = JSON.stringify(data);
      localStorage.setItem('puzzleState', JSON.stringify(data));
    }
  };

  //load the state of the puzzle from storage if we can use it
  this.loadState = function (img, scale, pieceSize) {
    if (canUseLocalStorage) {
      var json_data = localStorage.getItem('puzzleState');
      if (json_data != null && json_data.length > 0) {
        var data = JSON.parse(json_data);
        //check if data is valid
        if (
          data.size != mainPieceSize ||
          data.scale != mainScale ||
          data.imageurl != imageurl
        ) {
          //invalidate data
          localStorage.setItem('puzzleState', null);
          //not loaded
          this.wasLoaded = false;
          //cancel
          return;
        }
        this.pieceSize = data.pieces[0][3];
        this.columns = Math.floor((img.width * scale) / this.pieceSize);
        this.rows = Math.floor((img.height * scale) / this.pieceSize);
        for (var i = 0; i < data.pieces.length; i++) {
          var p = new puzzlePiece();
          //default in place with 0 rotation
          p.x = data.pieces[i][0];
          p.y = data.pieces[i][1];
          p.r = data.pieces[i][2];
          p.size = data.pieces[i][3];
          //image grid position
          p.gridX = data.pieces[i][4];
          p.gridY = data.pieces[i][5];
          p.inPlace = data.pieces[i][6];
          this.totalPieces++;
          if (p.inPlace) this.piecesInPlace++;
          p.edges = [
            data.pieces[i][7],
            data.pieces[i][8],
            data.pieces[i][9],
            data.pieces[i][10],
          ];
          //calc bounds
          p.calculateBoundries();
          //create piece image
          p.createImage(img, scale);
          //add to layer list
          if (this.piecesStart == null) {
            this.piecesStart = p;
            this.piecesEnd = p;
          } else {
            this.piecesEnd.next = p;
            p.next = null;
            p.prev = this.piecesEnd;
            this.piecesEnd = p;
          }
        }
        this.wasLoaded = true;
      }
    }
  };
}

//puzzle piece object
function puzzlePiece() {
  //position
  this.x = 0;
  this.y = 0;
  //rotation
  this.r = 0;
  //piece size
  this.size = 0;

  //depth list links
  this.prev = null;
  this.next = null;

  //image grid location
  this.gridX = 0;
  this.gridY = 0;

  //edge types
  this.edges = [0, 0, 0, 0];
  //edge bounds (x, y, w, h)
  this.bounds = [0, 0, 0, 0];

  //piece image
  this.image = null;

  //piece is set in it's place
  this.inPlace = false;

  this.lastDrawPosX = -999;
  this.lastDrawPosY = -999;
  this.lastDrawPosR = -999;

  this.calculateBoundries = function () {
    //calc boundries based on sides
    this.bounds[0] = 0;
    this.bounds[1] = 0;
    this.bounds[2] = this.size * 1.4;
    this.bounds[3] = this.size * 1.4;
    if (this.edges[3] == 0) this.bounds[0] = 0.2 * this.size;
    else if (this.edges[3] == -1) this.bounds[0] = 0.1 * this.size;
    this.bounds[2] -= this.bounds[0];
    if (this.edges[0] == 0) this.bounds[1] = 0.2 * this.size;
    else if (this.edges[0] == -1) this.bounds[1] = 0.1 * this.size;
    this.bounds[3] -= this.bounds[1];
    if (this.edges[1] == 0) this.bounds[2] -= 0.2 * this.size;
    else if (this.edges[1] == -1) this.bounds[2] -= 0.1 * this.size;
    if (this.edges[2] == 0) this.bounds[3] -= 0.2 * this.size;
    else if (this.edges[2] == -1) this.bounds[3] -= 0.1 * this.size;
  };

  //create this piece image
  this.createImage = function (img, scale) {
    //create canvas for piece
    this.image = document.createElement('canvas');
    this.image.width = this.size * 1.4;
    this.image.height = this.size * 1.4;
    //temporary context
    var tempctx = this.image.getContext('2d');
    tempctx.save();
    var local_offset = this.size * 0.2;
    tempctx.moveTo(local_offset, local_offset);
    //top mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] = local_offset + cutoutCoords[i * 6 + j * 2] * this.size;
        py[j] =
          local_offset +
          this.edges[0] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //right mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset +
          this.size +
          -this.edges[1] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
        py[j] = local_offset + cutoutCoords[i * 6 + j * 2] * this.size;
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //bottom mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset + this.size - cutoutCoords[i * 6 + j * 2] * this.size;
        py[j] =
          local_offset +
          this.size -
          this.edges[2] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //left mask
    for (var i = 0; i < cutoutCoords.length / 6; i++) {
      var px = [0, 0, 0];
      var py = [0, 0, 0];
      for (var j = 0; j < 3; j++) {
        px[j] =
          local_offset -
          -this.edges[3] * (cutoutCoords[i * 6 + (j * 2 + 1)] * this.size);
        py[j] =
          local_offset + this.size - cutoutCoords[i * 6 + j * 2] * this.size;
      }
      tempctx.bezierCurveTo(px[0], py[0], px[1], py[1], px[2], py[2]);
    }
    //clip draw area
    tempctx.clip();
    //draw image to temp context
    //console.log((((this.gridX * this.size) - local_offset) / scale) + "," + (((this.gridY * this.size) - local_offset) / scale) + "," + (((this.size * 1.4) / scale) + "," + (this.size * 1.4) / scale) + ", 0, 0, " + (this.size * 1.4) + "," + (this.size * 1.4));
    var tempx = this.gridX * this.size - local_offset;
    var tempx2 = 0;
    var tempy = this.gridY * this.size - local_offset;
    var tempy2 = 0;
    if (tempx < 0) {
      tempx2 = Math.abs(tempx);
      tempx = 0;
    }
    if (tempy < 0) {
      tempy2 = Math.abs(tempy);
      tempy = 0;
    }
    tempctx.drawImage(
      img,
      tempx / scale,
      tempy / scale,
      (this.size * 1.4) / scale,
      (this.size * 1.4) / scale,
      tempx2,
      tempy2,
      this.size * 1.4,
      this.size * 1.4,
    );
    tempctx.restore();
    //free context
    tempctx = null;
  };

  //is in bounds of this piece
  this.inBounds = function (context, cx, cy) {
    if (
      cx > this.x &&
      cy > this.y &&
      cx < this.x + this.size * 1.4 &&
      cy < this.y + this.size * 1.4
    )
      return true;
    return false;
  };
}

//initialize the puzzle and set things up
function init() {
  //check for local storage
  canUseLocalStorage = supports_html5_storage();
  if (!canUseLocalStorage)
    alert(
      "Your browser won't allow local storage for this page!\nAll progress will be lost if the page is closed or reloaded.",
    );
  //grab canvas
  maincanvas = document.getElementById('maincanvas');
  //get context
  context = maincanvas.getContext('2d');
  //create backing canvas
  backingCanvas = document.createElement('canvas');
  backingContext = backingCanvas.getContext('2d');

  //create puzzle object
  mainPuzzle = new puzzle();
  //image object
  img = document.createElement('img');
  //attach a callback and load
  img.onload = imageLoaded;
  //load

  //check url params for a custom image and options
  var param1 = window.location.search.split('?');
  if (0 && param1.length > 1) {
    var param2 = param1[1].split('&');
    for (var i = 0; i < param2.length; i++) {
      var param3 = param2[i].split('=');
      if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'img' &&
        param3[1] != ''
      ) {
        imageurl = decodeURIComponent(param3[1]);
      } else if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'scale' &&
        param3[1] != ''
      ) {
        mainScale = parseFloat(param3[1]);
      } else if (
        param3.length > 1 &&
        param3[0].toLowerCase() == 'size' &&
        param3[1] != ''
      ) {
        mainPieceSize = parseFloat(param3[1]);
      }
    }
  }
  img.src = imageurl;
}

//redraw scene function
function redraw() {
  if (isDone) {
    if (finalState == 'wipe' && finalWipePos > 0) {
      //console.log(finalWipePos);
      context.save();
      context.shadowOffsetX = 10;
      context.shadowBlur = 5;
      context.shadowColor = '#CCCCCC';

      context.drawImage(
        img,
        0,
        0,
        finalWipePos / mainScale,
        (mainPuzzle.rows * mainPuzzle.pieceSize) / mainScale,
        0,
        0,
        finalWipePos,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.restore();

      context.strokeStyle = 'black';
      context.lineWidth = 2;
      context.strokeRect(
        1,
        1,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
    }
    if (finalState == 'fixeddialog' || finalState == 'fixed') {
      context.fillStyle = 'white';
      context.fillRect(0, 0, maincanvas.width, maincanvas.height);
      context.drawImage(
        img,
        0,
        0,
        (mainPuzzle.columns * mainPuzzle.pieceSize) / mainScale,
        (mainPuzzle.rows * mainPuzzle.pieceSize) / mainScale,
        0,
        0,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.strokeStyle = 'black';
      context.lineWidth = 2;
      context.strokeRect(
        1,
        1,
        mainPuzzle.columns * mainPuzzle.pieceSize,
        mainPuzzle.rows * mainPuzzle.pieceSize,
      );
      context.font = '12pt Arial';
      context.textBaseline = 'top';
      context.fillStyle = 'black';
      context.fillText(
        'A/D = Rotate Piece  |  C = Find Lost Pieces  |  R = Re-shuffle Remaining Pieces  |  N = Start Over',
        5,
        mainPuzzle.rows * mainPuzzle.pieceSize + 5,
      );
    }
  } else if (dragging && !firstDrag) {
    var p = mainPuzzle.piecesStart;
    //redraw background in an inefficient way but safe and easy
    context.drawImage(
      backingCanvas,
      p.lastDrawPosX - 5,
      p.lastDrawPosY - 5,
      p.size * 1.4 + 15,
      p.size * 1.4 + 15,
      p.lastDrawPosX - 5,
      p.lastDrawPosY - 5,
      p.size * 1.4 + 15,
      p.size * 1.4 + 15,
    );

    //draw top piece
    context.save();
    context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

    context.rotate(p.r);
    //drop shadow if not in place
    if (!p.inPlace) {
      context.shadowColor = '#000000';
      context.shadowBlur = 5;
      context.shadowOffsetX = 3;
      context.shadowOffsetY = 3;
    }
    //draw piece to scene
    context.drawImage(
      p.image,
      -1 * ((p.size * 1.4) / 2),
      -1 * ((p.size * 1.4) / 2),
    );
    context.restore();
    p.lastDrawPosX = p.x;
    p.lastDrawPosY = p.y;
    p.lastDrawPosR = p.r;
  } else {
    //clear background
    context.fillStyle = 'white';
    context.fillRect(0, 0, maincanvas.width, maincanvas.height);
    //draw puzzle bounding box
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.strokeRect(
      1,
      1,
      mainPuzzle.columns * mainPuzzle.pieceSize,
      mainPuzzle.rows * mainPuzzle.pieceSize,
    );
    context.font = '12pt Arial';
    context.textBaseline = 'top';
    context.fillStyle = 'black';
    context.fillText(
      'A/D = Rotate Piece  |  C = Find Lost Pieces  |  R = Re-shuffle Remaining Pieces  |  N = Start Over',
      5,
      mainPuzzle.rows * mainPuzzle.pieceSize + 5,
    );

    var p = mainPuzzle.piecesEnd;
    //draw bottom to top except the top piece
    while (p.prev != null) {
      context.save();

      context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

      context.rotate(p.r);
      //drop shadow if not in place
      if (!p.inPlace) {
        context.shadowColor = '#000000';
        context.shadowBlur = 5;
        context.shadowOffsetX = 3;
        context.shadowOffsetY = 3;
      }
      //draw piece to scene
      context.drawImage(
        p.image,
        -1 * ((p.size * 1.4) / 2),
        -1 * ((p.size * 1.4) / 2),
      );
      context.restore();

      p.lastDrawPosX = p.x;
      p.lastDrawPosY = p.y;
      p.lastDrawPosR = p.r;

      p = p.prev;
    }

    //snapshot current view minus top piece
    backingContext.drawImage(maincanvas, 0, 0);

    //draw top piece
    context.save();

    context.translate(p.x + (p.size * 1.4) / 2, p.y + (p.size * 1.4) / 2);

    context.rotate(p.r);
    context.strokeStyle = 'black';
    //drop shadow if not in place
    if (!p.inPlace) {
      context.shadowColor = '#000000';
      context.shadowBlur = 5;
      context.shadowOffsetX = 3;
      context.shadowOffsetY = 3;
    }
    //draw piece to scene
    context.drawImage(
      p.image,
      -1 * ((p.size * 1.4) / 2),
      -1 * ((p.size * 1.4) / 2),
    );
    context.restore();
    p.lastDrawPosX = p.x;
    p.lastDrawPosY = p.y;
    p.lastDrawPosR = p.r;

    if (dragging) firstDrag = false;
  }
}

//***callbacks***
//browser window resize
function onResize() {
  maincanvas.style.width = window.innerWidth - 10;
  maincanvas.style.height = window.innerHeight - 10;
  //adjust canvas to match canvas element
  maincanvas.width = window.innerWidth - 10;
  maincanvas.height = window.innerHeight - 10;

  //adjust the backing canvas to match the main
  backingCanvas.width = maincanvas.width;
  backingCanvas.height = maincanvas.height;

  if (mainPuzzle != null)
    mainPuzzle.collectLostPieces(maincanvas.width, maincanvas.height);
  hasChanged = true;
}

//main image loaded
function imageLoaded() {
  //attempt load puzzle state
  if (canUseLocalStorage) mainPuzzle.loadState(img, mainScale, mainPieceSize);

  //generate puzzle pieces if not loaded state
  if (!mainPuzzle.wasLoaded)
    mainPuzzle.buildPieces(img, mainScale, mainPieceSize);

  //resize canvas width/height
  onResize();
  if (!mainPuzzle.wasLoaded) {
    mainPuzzle.shufflePieces(maincanvas.width - 10, maincanvas.height - 10);
    mainPuzzle.saveState();
  } else {
    if (mainPuzzle.piecesInPlace == mainPuzzle.totalPieces) {
      isDone = true;
      finalState = 'fixed';
    }
  }
  //catch future window resize events
  window.addEventListener('resize', onResize, false);

  //controls callbacks
  maincanvas.addEventListener('mousedown', onMouseDown, false);
  maincanvas.addEventListener('mouseup', onMouseUp, false);
  maincanvas.addEventListener('mousemove', onMouseMove, false);
  maincanvas.addEventListener('touchstart', onTouchDown, false);
  maincanvas.addEventListener('touchend', onTouchUp, false);
  maincanvas.addEventListener('touchmove', onTouchMove, false);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  //start main loop
  hasChanged = true;
  requestAnimationFrame(animate);
}

//mouse move, move piece and update
function onMouseMove(event) {
  if (dragging) {
    mainPuzzle.piecesStart.x = event.clientX - (mainPuzzle.pieceSize * 1.4) / 2;
    mainPuzzle.piecesStart.y = event.clientY - (mainPuzzle.pieceSize * 1.4) / 2;
    hasChanged = true;
  }
}
function onTouchMove(event) {
  let touch = event.touches[0];
  if (touch) {
    mainPuzzle.piecesStart.x = touch.clientX - (mainPuzzle.pieceSize * 1.4) / 2;
    mainPuzzle.piecesStart.y = touch.clientY - (mainPuzzle.pieceSize * 1.4) / 2;
    hasChanged = true;
  }
}

//key down, if dragging then rotate and update
function onKeyDown(event) {
  if (dragging) {
    if (event.keyCode == 65) {
      rotateKeysDown = -1;
      hasChanged = true;
    }
    if (event.keyCode == 68) {
      rotateKeysDown = 1;
      hasChanged = true;
    }
  }
}

//key up, stop rotating if we were or trigger single press events
function onKeyUp(event) {
  if (event.keyCode == 65 && rotateKeysDown == -1) rotateKeysDown = 0;
  if (event.keyCode == 68 && rotateKeysDown == 1) rotateKeysDown = 0;
  if (event.keyCode == 82) {
    mainPuzzle.shufflePieces(maincanvas.width, maincanvas.height);
    hasChanged = true;
  }
  if (event.keyCode == 67) {
    mainPuzzle.collectLostPieces(maincanvas.width, maincanvas.height);
    hasChanged = true;
  }
  if (event.keyCode == 78) {
    var res = confirm('Are you sure you want to reset the puzzle?');
    if (res) {
      if (canUseLocalStorage) localStorage.setItem('puzzleState', null);
      var p = mainPuzzle.piecesStart;
      while (p.next != null) {
        p.inPlace = false;
        p = p.next;
      }
      mainPuzzle.piecesInPlace = 0;
      mainPuzzle.shufflePieces(maincanvas.width - 10, maincanvas.height - 10);
      isDone = false;
      finalState = '';
      finalWipePos = 0;
      hasChanged = true;
    }
  }
}

//mouse down, start dragging
function onMouseDown(event) {
  var curDrag = null;
  var p = mainPuzzle.piecesStart;
  //find piece to drag
  while (curDrag == null && p != null) {
    if (!p.inPlace && p.inBounds(context, event.clientX, event.clientY)) {
      curDrag = p;
    }
    p = p.next;
  }
  if (curDrag == null) return;
  //set this piece as dragging
  dragPiece = curDrag;
  //if found move to top of list
  if (curDrag.prev != null) {
    curDrag.prev.next = curDrag.next;
    if (curDrag.next != null) curDrag.next.prev = curDrag.prev;
    else mainPuzzle.piecesEnd = curDrag.prev;
    mainPuzzle.piecesStart.prev = curDrag;
    curDrag.next = mainPuzzle.piecesStart;
    curDrag.prev = null;
    mainPuzzle.piecesStart = curDrag;
  }
  dragging = true;
  firstDrag = true;
}
function onTouchDown(event) {
  rotateKeysDown = 1;
  var curDrag = null;
  var p = mainPuzzle.piecesStart;
  let touch = event.touches[0];
  //find piece to drag
  while (curDrag == null && p != null) {
    if (!p.inPlace && p.inBounds(context, touch.clientX, touch.clientY)) {
      curDrag = p;
    }
    p = p.next;
  }
  if (curDrag == null) return;
  //set this piece as dragging
  dragPiece = curDrag;
  //if found move to top of list
  if (curDrag.prev != null) {
    curDrag.prev.next = curDrag.next;
    if (curDrag.next != null) curDrag.next.prev = curDrag.prev;
    else mainPuzzle.piecesEnd = curDrag.prev;
    mainPuzzle.piecesStart.prev = curDrag;
    curDrag.next = mainPuzzle.piecesStart;
    curDrag.prev = null;
    mainPuzzle.piecesStart = curDrag;
  }
  dragging = true;
  firstDrag = true;
}

//stop dragging
function onMouseUp(event) {
  dragging = false;
  dragPiece = null;
}
function onTouchUp(event) {
  rotateKeysDown = 0;
  dragging = false;
  dragPiece = null;
}

//main animation function
function animate(timestamp) {
  if (animStart == null) animStart = timestamp;
  var timeSince = timestamp - animStart;
  animStart = timestamp;

  if (isDone) {
    if (finalState == 'wipe') {
      finalWipePos += 30 * (timeSince / 100);
      if (finalWipePos > mainPuzzle.columns * mainPuzzle.pieceSize) {
        finalWipePos = mainPuzzle.columns * mainPuzzle.pieceSize;
        finalState = 'fixeddialog';
      }
      hasChanged = true;
    } else if (finalState == 'fixeddialog') {
      alert('Congratulations!\nYou solved the puzzle!');
      finalState = 'fixed';
    }
    if (finalState == 'shimmer') {
      //fix this
    }
  } else {
    //check all pieces in place
    if (mainPuzzle.piecesInPlace == mainPuzzle.totalPieces) {
      isDone = true;
      finalState = 'wipe';
      finalWipePos = 0;
    } else {
      var top_piece = mainPuzzle.piecesStart;
      if (dragging) {
        top_piece.r += rotateKeysDown * 0.25 * (timeSince / 100);
        while (top_piece.r > Math.PI * 2.0) top_piece.r -= Math.PI * 2.0;
        while (top_piece.r < 0) top_piece.r += Math.PI * 2.0;
        hasChanged = true;
      } else {
        //check if top piece in place with some margin for error
        var targetX = top_piece.gridX * top_piece.size - top_piece.size * 0.2;
        var targetY = top_piece.gridY * top_piece.size - top_piece.size * 0.2;

        if (
          top_piece.x > targetX - 10 &&
          top_piece.x < targetX + 10 &&
          top_piece.y > targetY - 10 &&
          top_piece.y < targetY + 10 &&
          (top_piece.r > Math.PI * 1.9 || top_piece.r < 0.2)
        ) {
          top_piece.x = targetX;
          top_piece.y = targetY;
          top_piece.r = 0;
          top_piece.inPlace = true;
          mainPuzzle.piecesInPlace++;

          //move to bottom
          var p = mainPuzzle.piecesStart;
          mainPuzzle.piecesStart = p.next;
          mainPuzzle.piecesStart.prev = null;
          p.prev = mainPuzzle.piecesEnd;
          mainPuzzle.piecesEnd.next = p;
          p.next = null;
          mainPuzzle.piecesEnd = p;
          hasChanged = true;
        }
        if (hasChanged) mainPuzzle.saveState();
      }
    }
  }

  if (hasChanged) {
    redraw();
    hasChanged = false;
  }
  requestAnimationFrame(animate);
}
