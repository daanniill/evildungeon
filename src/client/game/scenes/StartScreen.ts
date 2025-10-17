import { Scene, GameObjects } from 'phaser';

export class StartScreen extends Scene {
  background: GameObjects.Image | null = null;
  logo: GameObjects.Image | null = null;
  knight: GameObjects.Image | null = null;
  title: GameObjects.Text | null = null;
  subtitle: GameObjects.Text | null = null;
  startText: GameObjects.Text | null = null;

  constructor() {
    super('StartScreen');
  }

  init(): void {
    this.background = null;
    this.logo = null;
    this.knight = null;
    this.title = null;
    this.subtitle = null;
    this.startText = null;
  }

  create() {
    this.refreshLayout();

    this.scale.on('resize', () => this.refreshLayout());

    this.input.once('pointerdown', () => {
      this.scene.start('Dungeon');
    });

    // Add keyboard support
    this.input.keyboard!.on('keydown', () => {
      this.scene.start('Dungeon');
    });
  }

  private refreshLayout(): void {
    const { width, height } = this.scale;

    this.cameras.resize(width, height);

    // Background
    if (!this.background) {
      this.background = this.add.image(0, 0, 'background').setOrigin(0);
    }
    this.background!.setDisplaySize(width, height);

    const scaleFactor = Math.min(width / 1024, height / 768);

    // Knight sprite
    if (!this.knight) {
      this.knight = this.add.image(0, 0, 'knight');
    }
    this.knight!.setPosition(width * 0.25, height * 0.6).setScale(scaleFactor * 2);

    // Logo
    if (!this.logo) {
      this.logo = this.add.image(0, 0, 'logo');
    }
    this.logo!.setPosition(width * 0.5, height * 0.4).setScale(scaleFactor * 0.8);

    // Title
    if (!this.title) {
      this.title = this.add
        .text(0, 0, 'EVIL DUNGEON', {
          fontFamily: 'Arial Black',
          fontSize: '48px',
          color: '#ff4444',
          stroke: '#000000',
          strokeThickness: 8,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.title!.setPosition(width * 0.5, height * 0.2);
    this.title!.setScale(scaleFactor);

    // Subtitle
    if (!this.subtitle) {
      this.subtitle = this.add
        .text(0, 0, 'A Rogue-Like Adventure', {
          fontFamily: 'Arial',
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.subtitle!.setPosition(width * 0.5, height * 0.3);
    this.subtitle!.setScale(scaleFactor);

    // Start instruction
    if (!this.startText) {
      this.startText = this.add
        .text(0, 0, 'Click or Press Any Key to Start', {
          fontFamily: 'Arial',
          fontSize: '20px',
          color: '#ffff00',
          stroke: '#000000',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.startText!.setPosition(width * 0.5, height * 0.85);
    this.startText!.setScale(scaleFactor);

    // Add blinking effect to start text
    this.tweens.add({
      targets: this.startText,
      alpha: 0.3,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });
  }
}
