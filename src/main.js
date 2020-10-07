import { Player } from "textalive-app-api";
import * as THREE from "three";
class ColorSpinner {
  constructor() {
    this.colorPtr = 0;
    this.colors = [
      0xd74c55,
      0xf4964a,
      0xe9f608,
      0x47c776,
      0x0566d1,
      0xd989ef,
    ];
  }
  pick() {
    // 每次依序回傳不同顏色
    return this.colors[this.colorPtr++ % this.colors.length];
  }
}

/* 主要顯示與互動物件 */
class PVScene {
  constructor(url) {
    this.url = url;

    // 初始化 TextAlive App
    this.player = new Player({ app: true });

    // 目前播放資訊
    this.playerProgress = {
      position: null,
      beat: null,
      chorus: null,
      chord: null,
      phrase: null,
      word: null,
      char: null,
      volume: null,
      isPlaying: false,
      ready: false
    };

    // 影片固定資訊
    this.videoInformation = {
      duration: null,
      charCount: null,
      wordCount: null,
    };

    // Three.js 顯示相關變數
    this.lyrics = [];
    this.otherMeshes = [];
    this.groundZero = 0;
    this.speedFactor = 0.005;
    this.colorful = false;
    this.colorSpinner = new ColorSpinner();
    this.clock = new THREE.Clock();

    // Three.js 滑鼠事件相關變數
    this.lastMouseDown = null;
    this.lastMouseDownAt = null;
    this.panFrom = null;
    this.isPanning = false;

    // this binding
    this.initPlayer = this.initPlayer.bind(this);
    this.initThreeJs = this.initThreeJs.bind(this);
    this.onAppReady = this.onAppReady.bind(this);
    this.onVideoReady = this.onVideoReady.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.setController = this.setController.bind(this);
    this.render = this.render.bind(this);

    // 初始化 three.js 畫面
    this.initThreeJs();

    // 初始化 TextAlive App event listener
    this.initPlayer();

    // 觸發 render loop
    this.render();
  }

  /* TextAlive App API 相關 */
  /* 初始化 TextAlive App event listener */
  initPlayer() {
    this.player.addListener({
      // App API 可互動，此時選定影片並載入
      onAppReady: this.onAppReady,

      // 影片資訊完成載入，影片本身不一定已載入，有可能無法播放
      onVideoReady: this.onVideoReady,

      // 影片完全載入可播放
      onTimerReady: () => {
        console.log("timer is ready");
        if (document.getElementById("player-outer")) {
          document.getElementById("player-outer").classList.add("ready");
        }
      },

      // 同步影片時間，這裡只做為 this.playerProgress 資訊更新使用
      onTimeUpdate: this.onTimeUpdate,

      // 開始播放
      onPlay: () => {
        this.playerProgress.isPlaying = true;
        this.groundZero = Date.now() - this.playerProgress.position;
        this.otherMeshes.forEach((mesh) => {
          mesh.visible = false;
        });
        this.otherMeshes = [];
        console.log("playing");
        this.renderer.domElement.classList.add("playing");
      },

      // 暫停、停止、或影片結束
      // 停止或影片結束時會多呼叫一次 onMediaSeek
      onPause: () => {
        this.playerProgress.isPlaying = false;
        console.log("paused");
        if (!this.isPanning) {
          this.renderer.domElement.classList.remove("playing");
        }
      },

      // 影片時間軸變動，實測觸發頻率比 onTimeUpdate 低
      onMediaSeek: () => {
        // 定時同步 TextAlive App API 與 Three.js 各自的時間
        // 由於 Three.js render 執行頻率會比 onTimeUpdate 或 onMediaSeek 高，分開處理可以避免掉 frame
        let now = Date.now();
        if (this.groundZero - (now - this.playerProgress.position) > 100) {
          this.groundZero = now - this.playerProgress.position;
        }
      },

      // 變更影片時觸發
      onAppMediaChange: () => {
        console.log("media changed");
      }
    });
  }
  onAppReady(app) {
    if (!app.songUrl) {
      // 指定歌曲 URL
      this.player.createFromSongUrl(this.url);
    }
    if (!app.managed) {
      // 官方範例有使用，但沒有解釋原因
      // 實際使用上並沒有遇到這種狀況，所以此處留空
    }
  }
  onTimeUpdate(now) {
    this.playerProgress.position = now;

    // 取得並更新節拍資訊
    // 
    // beat.index: 節拍在樂曲中的位置，從 0 開始
    // beat.length: 小節中的節拍數
    // beat.position: 節拍在小節中的位置，從 1 開始
    // beat.next: 指向下一個節拍
    // beat.previous: 指向上一個節拍
    // beat.duration: 持續時間，毫秒
    // beat.startTime: 開始時間，毫秒
    // beat.endTime: 結束時間，毫秒
    let beat = this.player.findBeat(now);
    if (this.playerProgress.beat !== beat) {
      this.playerProgress.beat = beat;
      console.log("update beat:", beat);

      // 繪製節拍環
      // 5 points ring
      // facing x-axis
      let geometry = new THREE.RingGeometry(4.9, 5, 5);
      let material = new THREE.MeshBasicMaterial({

        // 顏色根據目前副歌判斷使用彩色或灰色
        color: this.colorful ? this.colorSpinner.pick() : 0x393939,
        side: THREE.DoubleSide
      });

      // 每個小節的開頭使用實心環，其他使用 wireframe
      let circle = beat.position == 1 ? new THREE.Mesh(geometry, material) : new THREE.Line(geometry, material);
      circle.position.x = 15;
      circle.rotateY(90);
      this.scene.add(circle);
      this.otherMeshes.push(circle);
    }

    // 取得並更新和弦進行（Chord Progression）資訊
    // 
    // chord.duration: 持續時間，毫秒
    // chord.index: 在樂曲中的位置，從 0 開始
    // chord.next: 指向下一個
    // chord.previous: 指向上一個
    // chord.startTime: 開始時間，毫秒
    // chord.endTime: 結束時間，毫秒
    this.playerProgress.chord = this.player.findChord(now);

    // 取得並更新副歌資訊
    // 
    // chorus.duration: 持續時間，毫秒
    // chorus.index: 在樂曲中的位置，從 0 開始
    // chorus.next: 指向下一個副歌
    // chorus.previous: 指向上一個副歌
    // chorus.startTime: 開始時間，毫秒
    // chorus.endTime: 結束時間，毫秒
    let chorus = this.player.findChorus(now);
    if (this.playerProgress.chorus !== chorus) {
      this.playerProgress.chorus = chorus;
      console.log("update chorus:", chorus);

      // 切換五邊環的顯示顏色
      if (chorus) {
        this.colorful = true;
      } else {
        this.colorful = false;
      }
    }

    // 目前歌詞（句）
    this.playerProgress.phrase = this.player.video.findPhrase(now);

    // 目前歌詞（字詞）
    this.playerProgress.word = this.player.video.findWord(now);

    // 目前歌詞（字）
    this.playerProgress.char = this.player.video.findChar(now);

    // 目前主唱音量
    this.playerProgress.volume = this.player.getVocalAmplitude(now);
  }
  onVideoReady() {
    // 歌詞字元總數
    console.log(`charCount: ${this.player.video.charCount}`);

    // 歌詞字詞總數
    console.log(`wordCount: ${this.player.video.wordCount}`);

    // 歌曲總長，單位毫秒
    console.log(`duration: ${this.player.video.duration}`);
    this.videoInformation.duration = this.player.video.duration;

    // 逐句取得歌詞
    let phrase = this.player.video.firstPhrase;
    while (phrase) {
      // 逐詞取得句中歌詞，可再往下取得 Char（字元）
      let wordsOfPhrase = [];
      let textMeshes = [];

      // word.text: 單詞內容字串
      // word.animate: 單詞出現時的 callback function，可綁定自定義函數
      // word.pos: 單詞 Part-of-Speech 標籤：
      //   N: 名詞 (Noun)
      //   PN: 代名詞 (ProNoun)
      //   V: 動詞 (Verb)
      //   R: 副詞 (adveRb)
      //   J: 形容詞 (adJective)
      //   A: 連体詞 (Adnominal adjective)
      //   P: 助詞 (Particle)
      //   M: 助動詞 (Modal)
      //   W: 疑問詞 (Wh)
      //   D: 冠詞 (Determiner)
      //   I: 接続詞 (conjunction)
      //   U: 感動詞 (Interjection)
      //   F: 接頭詞 (preFix)
      //   S: 記号 (Symbol)
      //   X: その他 (other)
      let word = phrase.firstWord;
      const fontSize = 64;
      const marginSize = 4;

      while (word && word.startTime < phrase.endTime) {
        wordsOfPhrase.push(`${word.text}（${word.pos}）`);

        // 利用 canvas 將歌詞貼到 Mesh 上
        let canvas = document.createElement('canvas');
        canvas.className = "canvas";
        canvas.width = word.text.length * (fontSize + marginSize);
        canvas.height = fontSize + marginSize;
        let ctx = canvas.getContext('2d');
        if (ctx === null) {
          alert("Sorry, it seems your device is out of memory.");
        }
        // 隨詞性更改字體
        if (word.pos === "N") {
          ctx.font = `bold ${fontSize}px serif`;
        } else {
          ctx.font = `${fontSize * 0.8}px sans`;
        }
        ctx.fillStyle = "#393939";
        ctx.fillText(word.text, 0, fontSize);
        textMeshes.push({
          obj: word,
          mesh: new THREE.Mesh(
            new THREE.PlaneGeometry(word.text.length, 1),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
          ),
        });

        word = word.next;
      }

      this.lyrics.push(textMeshes);

      console.log(`${phrase.startTime}：「${wordsOfPhrase.join(" ")}」`);

      phrase = phrase.next;
    }
    this.lyrics.forEach((line, lineIdx) => {
      line.forEach((word, idx) => {
        // 固定歌詞 y,z 位置，x 由 render 計算
        word.mesh.position.y = lineIdx % 3 - 1;
        word.mesh.position.z = lineIdx % 3 - 1;
        word.mesh.visible = false;
        this.scene.add(word.mesh);
      })
    })
  }

  /* Three.js 相關 */
  /* 初始化 three.js 畫面 */
  initThreeJs() {
    // 建立 Three.js 場景
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xffffff, 1);
    document.getElementById("player-outer").appendChild(this.renderer.domElement);

    // 綁定滑鼠事件
    // 短於 200ms 的 mousedown-up 會被視作 click
    // 長於 200ms 會進入時間軸平移模式，並自動暫停
    this.setController(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // 視窗大小改變時重算
    window.addEventListener("resize", () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    })
    // 初始相機位置
    this.camera.position.set(-1.2, 0, 5);

    // 永遠直視原點 (0, 0, 0)
    this.camera.lookAt(this.scene.position);

    // 些微環境光方便 debug
    this.ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(this.ambientLight);
  }

  /* 綁定滑鼠事件 */
  setController(dom) {
    dom.addEventListener("mousedown", (event) => {
      this.lastMouseDown = Date.now();
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.lastMouseDownAt = { x: event.clientX, y: null };
      event.preventDefault();
    });
    dom.addEventListener("mouseup", (event) => {
      if (Date.now() - this.lastMouseDown < 200) {
        // 短於 200ms 的 mousedown-up 視作 click
        if (this.playerProgress.isPlaying) {
          this.player.requestPause();
        } else {
          this.player.requestPlay();
        }
      } else if (this.isPanning) {
        // requestMediaSeek 會有 0.2-0.5 秒左右的延遲
        // 提前更新 groundZero 可以減少畫面跳動的狀況
        this.groundZero = Date.now() - this.playerProgress.position;
        this.player.requestMediaSeek(this.playerProgress.position);
        this.player.requestPlay();
      }
      this.lastMouseDown = null;
      this.panFrom = null;
      this.isPanning = false;
      event.preventDefault();
    });
    dom.addEventListener("mousemove", (event) => {
      const rect = this.renderer.domElement.getBoundingClientRect();

      // 計算滑鼠位置百分比並縮放到 [-1.0, 1.0] 之間
      const aspect = - 1 + 2 * ((event.clientY - rect.top) / rect.height);

      // Three.js camera 跟隨上下 15 度移動
      // 15deg ~= 0.2618rad
      // 固定看向 0, 0, 0
      this.camera.position.y = Math.sin(0.2618 * aspect) * 5;
      this.camera.position.z = Math.cos(0.2618 * aspect) * 5;
      this.camera.lookAt(this.scene.position);
      if (this.lastMouseDown && (this.isPanning || this.playerProgress.isPlaying && (Date.now() - this.lastMouseDown > 200))) {
        // 播放中拖動時間軸，如果不是播放中可以忽略
        if (!this.panFrom) {
          this.panFrom = this.playerProgress.position;
        }
        this.player.requestPause();
        this.isPanning = true;
        this.playerProgress.position = this.panFrom - (30000 * (event.clientX - this.lastMouseDownAt.x) / rect.width);
      }
    });
  }

  /* render loop */
  render() {
    // 暫停時不進行 render，保留 canvas 既有畫面
    if (this.playerProgress.isPlaying || this.isPanning) {

      // 時間軸平移時 playerProgress.position 由 PVScene 物件控制，可以自由使用
      // 播放時 playerProgress 會不定期更新，直接使用會掉 frame
      const progress = this.isPanning ? this.playerProgress.position : Date.now() - (this.groundZero || 0);

      // 歌詞物件顯現並更新位置
      this.lyrics.forEach(line => {
        line.forEach((word, idx) => {
          if (word.obj.startTime < progress && word.obj.endTime < (progress + 200000)) {
            word.mesh.visible = true;
            // 每句第一個 word mesh 依照時間與 this.speedFactor 計算位置
            // 其餘跟隨前一個 word mesh 的位置
            word.mesh.position.x = (idx === 0 ?
              ((word.obj.startTime - (progress || 0)) * this.speedFactor + 10) :
              (line[idx - 1] && (line[idx - 1].mesh.position.x + (line[idx - 1].obj.text.length / 2)) || Number.NEGATIVE_INFINITY)
            ) + (word.obj.text.length / 2);
          } else {
            // 超過 200 秒後隱藏
            word.mesh.visible = false;
          }
        })
      });

      // 節拍環與影片時間無關，跟音樂有關
      // 另外使用 Three.js 內建 clock 取得簡單時間更新
      // 播放時節拍環與歌詞基本上相同
      // 但時間軸平移時會依照原本速率前進
      // 而且因為沒有聲音也就不應該有新的節拍環出現
      const diff = this.clock.getDelta();
      this.otherMeshes.forEach((mesh) => {
        if (mesh.position.x > -100) {
          mesh.position.set(mesh.position.x - (diff * 1000 * this.speedFactor), 0, 0);
          mesh.rotateZ(diff * -0.1 * Math.PI);
        } else {
          mesh.visible = false;
        }
      });
      this.otherMeshes = this.otherMeshes.filter(o => o.visible);

      // 正式 render
      this.renderer.render(this.scene, this.camera);
    }

    requestAnimationFrame(this.render);
  }
}

// 愛されなくても君がいる / ピノキオピー feat. 初音ミク
// const pvScene = new PVScene("https://www.youtube.com/watch?v=ygY2qObZv24");
//
// ブレス・ユア・ブレス / 和田たけあき feat. 初音ミク
// const pvScene = new PVScene("http://www.youtube.com/watch?v=a-Nf3QUFkOU");
// 
// グリーンライツ・セレナーデ / Omoi feat. 初音ミク
const pvScene = new PVScene("https://www.youtube.com/watch?v=XSLhsjepelI");