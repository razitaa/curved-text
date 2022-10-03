const { selection } = require("scenegraph")
let commands = require("commands");
let panel;

function create() {
    const HTML =
        `<style>
            .break {
                flex-wrap: wrap;
            }
            label.row > span {
                color: #8E8E8E;
                width: 20px;
                text-align: right;
                font-size: 9px;
            }
            label.row input {
                flex: 1 1 auto;
            }
            .show {
                display: block;
            }
            .hide {
                display: none;
            }
        </style>
        <form method="dialog" id="main">
            <div class="row break">
                <label class="row">
                    <span>↕︎</span>
                    <input type="number" uxp-quiet="true" id="txtV" value="10" placeholder="Height" />
                </label>
                <label class="row">
                    <span>↔︎</span>
                    <input type="number" uxp-quiet="true" id="txtH" value="10" placeholder="Width" />
                </label>
            </div>
            <footer><button id="ok" type="submit" uxp-variant="cta">Apply</button></footer>
        </form>
        <p id="warning">This plugin requires you to select a path and a text in the document. Please select a path and a text.</p>
        `
    function fetchData() {
        var points = [];
        var texts = [];
        var paths = [];
        
      const { editDocument } = require("application");
      editDocument({ editLabel: "Fetch Path Data" }, function (selection) {
        const { Path } = require("scenegraph");
        var path;
        var pathData;
        var text;

        if (selection.items[0] instanceof Path) {
          const selectedPath = selection.items[0];
          const selectedText = selection.items[1];
          pathData = selectedPath.pathData;
          text = selectedText.text;
          path = selectedPath;
        } else {
          const selectedPath = selection.items[1];
          const selectedText = selection.items[0];
          pathData = selectedPath.pathData;
          text = selectedText.text;
          path = selectedPath;
        }

        const chars = [];
        try {
          for (let i = 0; i < text.length; i++) {
            chars[i] = text.slice(i, i+1);
          }
        } catch (error) {
          console.log(error);
        }

        var char;
        var bezierCoords = [];
        var coord = [];
        var pastCoord = [];
        var numStr = '';
        var num;
        var pathCommand;
        var isNum;

        for (var i = 0; i <= pathData.length; i++) {
          if (i < pathData.length) {
            char = pathData.charAt(i);
          }
          if (char == ' ' || i == pathData.length) {
            if (isNum) {
              num = numStr - 0;
              numStr = '';
              coord.push(num);
              if (coord.length == 2) {
                if (pathCommand == 'L') {
                  //pastCoord, coord -> get point in line
                  getPointsInLine(pastCoord, coord);
                } else if (pathCommand == 'C') {
                  if (bezierCoords.length == 0) {
                    bezierCoords.push(pastCoord);
                  }
                  bezierCoords.push(coord);
                  if (bezierCoords.length == 4) {
                    //get point in curve
                    getPointsInCurve(bezierCoords);
                    bezierCoords = [];
                  }
                }
                pastCoord = coord;
                coord = [];
              }
            }
          } else {
            if (char == '.' || !isNaN(char * 1)) {
              if (numStr == '') {
                numStr = char;
              } else {
                numStr += char;
              }
              isNum = true;
            } else {
              //could be M, L, C, or Z
              pathCommand = char;
              isNum = false;
            }
          }

          function getPointsInLine(coord1, coord2) {
            // line equation
            var length = Math.sqrt(Math.pow((coord2[1] - coord1[1]), 2) + Math.pow((coord2[0] - coord1[0]), 2))
            if (coord1[0] != coord2[0]) {
              var gradient = (coord2[1] - coord1[1])/(coord2[0] - coord1[0]);
              var c = coord2[1] - gradient*coord2[0];
              for (var i = 0; i < length; i++) {
                var x;
                if (coord1[0] <= coord2[0]) {
                  x = coord1[0] + i/Math.sqrt(1 + Math.pow(gradient, 2));
                } else {
                  x = coord1[0] - i/Math.sqrt(1 + Math.pow(gradient, 2));
                }
                var y = gradient*x + c;
                points.push([x, y]);
              }
              points.push(coord2);
            } else {
              //vertical line
              for (var i = 0; i < length; i++) {
                var y = coord1[1] + i;
                points.push([coord1[0], y]);
              }
              points.push(coord2);
            }
          }

          function linearInterpolation(coord1, coord2, k) {
            var result = [];
            result.push(coord1[0] + (coord2[0] - coord1[0])*k)
            result.push(coord1[1] + (coord2[1] - coord1[1])*k)
            return result;
          }

          function bezierInterpolation(bezierCoords, k) {
            var k;
            var ab = linearInterpolation(bezierCoords[0], bezierCoords[1], k);
            var bc = linearInterpolation(bezierCoords[1], bezierCoords[2], k);
            var cd = linearInterpolation(bezierCoords[2], bezierCoords[3], k);
            var abbc = linearInterpolation(ab, bc, k);
            var bccd = linearInterpolation(bc, cd, k);
            var point = linearInterpolation(abbc, bccd, k);
            return point;
          }

          function getPointsInCurve(bezierCoords) {
            for (var i = 0; i < 1000; ++i) {
              var k = i/999;
              var point = bezierInterpolation(bezierCoords, k);
              points.push(point);
            }
          }
        }
        for (var i = 0; i < chars.length; i++) {

          commands.duplicate();

          for (var j = 0; j < selection.items.length; j++) {
            if (selection.items[0] instanceof Path) {
              if (j%3 == 1) {
                texts.push(selection.items[j]);
              } else {
                paths.push(selection.items[j]);
              }
            } else {
              if (j%3 == 0) {
                texts.push(selection.items[j]);
              } else {
                paths.push(selection.items[j]);
              }
            }
          }
        }

        for (var k = 0; k < paths.length; k++) {
          paths[k].removeFromParent();
        }

        for (var i = 0; i < texts.length; i++) {
          texts[i].text = chars[i];
        }
        
        var n = 0;
        var removedText = [];
        for (var i = 0; i < texts.length; i++) {
          try {
            if (points[n]) {
              let rotationAngleDeg;
              texts[i].moveInParentCoordinates(points[n][0], points[n][1]);

              var dist = 0;

              while (dist < texts[i].globalBounds.width && n < points.length) {
                if (n > 0) {
                  dist += Math.sqrt(Math.pow(points[n][1] - points[n - 1][1], 2) + Math.pow(points[n][0] - points[n - 1][0], 2));
                }
                n++;
              }
              dist = 0;
  
              if (points[n + 1] && points[n]) {
                if (points[n+1][0] != points[n][0]) {
                  let m = Number((points[n+1][1] - points[n][1])/(points[n+1][0] - points[n][0]));
                  let rotationAngleRad = Number(Math.atan(m));
                  rotationAngleDeg = Number(rotationAngleRad * 180/Math.PI);
                } else {
                  rotationAngleDeg = 90;
                }
                texts[i].rotateAround(rotationAngleDeg, {x: texts[i].localBounds.x + texts[i].localBounds.width/2, y: texts[i].localBounds.y + texts[i].localBounds.height/2});
              } else {
                removedText.push(texts[i]);
              }
            } else {
              removedText.push(texts[i]);
            }
          } catch (error) {
            console.log(n);
            console.log(error);
          }
        }

        try {
          while (removedText.length > 0) {
            texts[texts.length - 1].removeFromParent();
            texts.splice(texts.length - 1, 1);
            removedText.splice(removedText.length - 1, 1);
          }

          for (var i = 0; i < texts.length; i++) {
            if (texts[i-1] && texts[i+1]) {
              var midpointX = (texts[i-1].boundsInParent.x + texts[i-1].localBounds.width * Math.cos(texts[i-1].rotation * Math.PI/180) + texts[i+1].boundsInParent.x)/2;
              var midpointY = (texts[i-1].boundsInParent.y + texts[i-1].localBounds.width * Math.sin(texts[i-1].rotation * Math.PI/180) + texts[i+1].boundsInParent.y)/2;
              var deltaX = midpointX - texts[i].boundsInParent.x;
              var deltaY = midpointY - texts[i].boundsInParent.y;
              texts[i].moveInParentCoordinates(deltaX, deltaY);
            }
          }

          var distances = [];
          for (var i = 0; i < texts.length - 2; i++) {
            distances.push(Math.sqrt(Math.pow(texts[i+1].boundsInParent.x - texts[i].boundsInParent.x, 2) + Math.pow(texts[i+1].boundsInParent.y - texts[i].boundsInParent.y, 2)));
          }
          var totalDistance = 0;
          for(var i = 0; i < distances.length; i++) {
            totalDistance += distances[i];
          }
          var avgDistance = totalDistance / distances.length;

          for (var i = 1; i < texts.length; i++) {
            var m = (texts[i].boundsInParent.y - texts[i-1].boundsInParent.y)/(texts[i].boundsInParent.x - texts[i-1].boundsInParent.x);
            var c = texts[i].boundsInParent.y - m * texts[i].boundsInParent.x;
            var dist = avgDistance - Math.sqrt(Math.pow(texts[i].boundsInParent.x - texts[i-1].boundsInParent.x, 2) + Math.pow(texts[i].boundsInParent.y - texts[i-1].boundsInParent.y, 2));
            var deltaX = dist/Math.sqrt(1 + Math.pow(m, 2));
            console.log(texts[i-1].localBounds.width * Math.cos(texts[i-1].rotation * Math.PI/180));
            var deltaY = m * (texts[i].boundsInParent.x + deltaX) + c - texts[i].boundsInParent.y;
            texts[i].moveInParentCoordinates(deltaX + 1, deltaY + 1);
          }
            
          for (var i = 0; i < texts.length; i++) {
            if (texts[i].rotation == 90) {
              if (texts[i-1] && texts[i-1].boundsInParent.y > texts[i].boundsInParent.y) {
                texts[i-1].rotateAround(180, {x: texts[i-1].localBounds.x + texts[i-1].localBounds.width/2, y: texts[i-1].localBounds.y + texts[i-1].localBounds.height/2});
              }
            } else {
              if (texts[i-1] && texts[i].boundsInParent.x < texts[i-1].boundsInParent.x) {
                /*console.log(texts[i-1].text);
                console.log(texts[i].boundsInParent.x + texts[i].localBounds.x);
                console.log(texts[i].boundsInParent.x);
                console.log(texts[i-1].boundsInParent.x + texts[i-1].localBounds.x);
                console.log(texts[i-1].boundsInParent.x);
                console.log("-------------------");*/
                texts[i-1].rotateAround(180, {x: texts[i-1].localBounds.x + texts[i-1].localBounds.width/2, y: texts[i-1].localBounds.y + texts[i-1].localBounds.height/2});
              }
            }
          }

          selection.items = texts;
          commands.group();
          let group = selection.items[0];
          group.moveInParentCoordinates(path.globalBounds.x - group.globalBounds.x, path.globalBounds.y - group.globalBounds.y);
        } catch (error) {
          console.log(error);
        }
      })
    }

    panel = document.createElement("div");
    panel.innerHTML = HTML;
    panel.querySelector("form").addEventListener("submit", fetchData);

    return panel;
}

function show(event) {
    if (!panel) event.node.appendChild(create());
}

function update() {
    // [1]
  const { Path, Text } = require("scenegraph"); // [2]

  const form = document.querySelector("form"); // [3]
  const warning = document.querySelector("#warning"); // [4]

  if (selection.items.length == 2 && ((selection.items[0] instanceof Path && selection.items[1] instanceof Text) || (selection.items[1] instanceof Path && selection.items[0] instanceof Text))) {
      form.className = "show";
      warning.className = "hide";
  } else {
      form.className = "hide";
      warning.className = "show";
  }
}


module.exports = {
    panels: {
        curveText: {
            show,
            update
        }
    }
};