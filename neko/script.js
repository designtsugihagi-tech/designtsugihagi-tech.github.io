document.addEventListener('DOMContentLoaded', () => {
    // ページロード時のフェードイン
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 100);

    // リンククリック時のフェードアウト処理
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            // 外部リンクやJS無効リンクは除外
            if (href && href !== '#' && !href.startsWith('http') && !link.classList.contains('disabled')) {
                e.preventDefault();
                document.body.classList.remove('loaded');
                setTimeout(() => {
                    window.location.href = href;
                }, 800);
            }
        });
    });

    // アニメーション開始トリガー
    setTimeout(() => {
        // 物語ページのブロック表示
        const blocks = document.querySelectorAll('.fade-in-block');
        blocks.forEach(el => el.classList.add('visible'));

        // 目次ページの文字表示
        const chars = document.querySelectorAll('.char-base');
        let delay = 0;
        const delayIncrement = 50;

        chars.forEach((char, index) => {
            setTimeout(() => {
                char.classList.add('visible');
                // 全文字表示後にリンクを有効化
                if (index === chars.length - 1) {
                    setTimeout(activateLinks, 500);
                }
            }, delay);
            delay += delayIncrement;
        });
    }, 500);

    // 背景Canvas開始
    initBackgroundCanvas();
});

// 目次リンクの有効化
function activateLinks() {
    const links = document.querySelectorAll('.toc-link');
    links.forEach(link => {
        link.classList.add('active');
    });
}

// 目次用テキスト分割処理
const splitTextElements = () => {
    const split = (el, cls) => {
        if(el.children.length){
            Array.from(el.children).forEach(c => split(c, cls));
            return;
        }
        const txt = el.textContent.trim();
        if(!txt) return;
        
        el.textContent = '';
        txt.split('').forEach(c => {
            const s = document.createElement('span');
            s.textContent = c;
            s.classList.add('char-base', cls);
            el.appendChild(s);
        });
    };
    document.querySelectorAll('.column-top .line').forEach(l => split(l, 'char-up'));
    document.querySelectorAll('.column-bottom .line').forEach(l => {
        const link = l.querySelector('.toc-link');
        if (link) split(link, 'char-down');
        else split(l, 'char-down');
    });
};

// 目次ページ判定
if(document.querySelector('.writing-area')) {
    splitTextElements();
}

// 物語スクロール初期位置調整（右端スタート）
const storyContainer = document.getElementById('scroll-container');
if(storyContainer) {
    setTimeout(() => {
        storyContainer.scrollLeft = storyContainer.scrollWidth;
    }, 100);
}

// 背景アニメーション
function initBackgroundCanvas() {
    const cvs = document.getElementById('bg-canvas');
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let w, h, lines = [];
    const colors = [{r:104,g:137,b:158}, {r:196,g:163,b:191}];
    
    const resize = () => { w = cvs.width = window.innerWidth; h = cvs.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();
    
    class Line {
        constructor() { this.init(); }
        init() {
            this.x = w + Math.random()*100; this.y = h*(0.3+Math.random()*0.4);
            this.vx = -(1+Math.random()*1.5)*1.5; this.vy = (1+Math.random()*1.5);
            this.life = 0; this.maxLife = 100+Math.random()*200;
            this.hist = []; this.maxHist = 20+Math.random()*30;
            this.ang = 0; this.angSp = 0.02+Math.random()*0.03;
            this.col = Math.random()<0.2 ? colors[1] : colors[0];
        }
        update() {
            this.life++; this.ang += this.angSp;
            this.x += this.vx + Math.sin(this.ang); this.y += this.vy + Math.cos(this.ang*0.8);
            this.hist.push({x:this.x, y:this.y});
            if(this.hist.length > this.maxHist) this.hist.shift();
            if(this.x<-100 || this.y>h+100 || this.life>this.maxLife) this.init();
        }
        draw() {
            if(this.hist.length<2) return;
            ctx.beginPath(); ctx.moveTo(this.hist[0].x, this.hist[0].y);
            for(let i=1; i<this.hist.length-1; i++) {
                const xc = (this.hist[i].x+this.hist[i+1].x)/2, yc = (this.hist[i].y+this.hist[i+1].y)/2;
                ctx.quadraticCurveTo(this.hist[i].x, this.hist[i].y, xc, yc);
            }
            ctx.lineTo(this.hist[this.hist.length-1].x, this.hist[this.hist.length-1].y);
            let a = 0.1 + Math.random()*0.3;
            if(this.life<20) a *= this.life/20;
            if(this.life>this.maxLife-20) a *= (this.maxLife-this.life)/20;
            ctx.strokeStyle = `rgba(${this.col.r},${this.col.g},${this.col.b},${a})`;
            ctx.lineWidth = 0.5+Math.random()*1.5; ctx.lineCap='round'; ctx.stroke();
        }
    }
    for(let i=0; i<50; i++) { const l = new Line(); for(let j=0; j<Math.random()*300; j++) l.update(); lines.push(l); }
    const anim = () => { ctx.clearRect(0,0,w,h); lines.forEach(l=>{l.update();l.draw();}); requestAnimationFrame(anim); };
    anim();
}