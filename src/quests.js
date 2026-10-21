// Linha de missões dada pelo Ancião Aldric.
const QUESTS = [
  {
    title: 'Ameaça Goblin', target: 'goblin', count: 6, label: 'goblins', xp: 160, points: 1,
    intro: [
      'Bem-vindo, aventureiro! Sou Aldric, o ancião desta vila.',
      'Goblins têm atacado nossas plantações. Derrote 6 deles nos acampamentos próximos.',
    ],
    outro: ['Excelente trabalho! As plantações estão a salvo. Aceite esta recompensa.'],
  },
  {
    title: 'Uivos na Noite', target: 'wolf', count: 5, label: 'lobos', xp: 260, points: 1,
    intro: ['Lobos famintos rondam a floresta e ameaçam nossos rebanhos.', 'Cace 5 lobos e traga paz às nossas noites.'],
    outro: ['Os uivos cessaram. Você é um verdadeiro protetor!'],
  },
  {
    title: 'Ossos Inquietos', target: 'skeleton', count: 6, label: 'esqueletos arqueiros', xp: 420, points: 2,
    intro: ['Uma magia sombria ergueu os mortos nas terras além do lago.', 'Destrua 6 esqueletos arqueiros. Cuidado com as flechas!'],
    outro: ['Os mortos voltaram a descansar. Seu poder cresce a cada dia.'],
  },
  {
    title: 'Força Bruta', target: 'orc', count: 4, label: 'orcs brutamontes', xp: 600, points: 2,
    intro: ['Orcs brutamontes estão se reunindo nas terras distantes.', 'Derrote 4 deles antes que marchem até aqui.'],
    outro: ['Impressionante! Agora você está pronto para o maior dos desafios.'],
  },
  {
    title: 'O Golem Ancião', target: 'golem', count: 1, label: 'Golem Ancião', xp: 1500, points: 3,
    intro: ['O Golem Ancião despertou. Ele é a fonte de toda essa corrupção.', 'Siga a caveira no seu minimapa e derrote-o. Que os deuses te protejam!'],
    outro: ['Você derrotou o Golem Ancião! O reino de Aether está em dívida eterna com você.', 'Continue explorando, herói. Sempre haverá monstros para enfrentar.'],
  },
];

export class Quests {
  constructor(game) {
    this.g = game;
    this.i = 0;
    this.state = 'available';
    this.progress = 0;
  }

  get q() { return QUESTS[this.i]; }

  marker() {
    if (!this.q) return null;
    if (this.state === 'available') return '!';
    if (this.state === 'complete') return '?';
    return null;
  }

  talk() {
    const g = this.g, q = this.q;
    if (!q) { g.ui.showDialog('Ancião Aldric', ['Você é a lenda de Aether! Continue explorando e ficando mais forte.']); return; }
    if (this.state === 'available') {
      g.ui.showDialog('Ancião Aldric', q.intro, () => {
        this.state = 'active';
        this.progress = 0;
        g.ui.log(`Nova missão: ${q.title}`, 'gold');
        g.sfx('quest');
      });
    } else if (this.state === 'active') {
      g.ui.showDialog('Ancião Aldric', [`Ainda faltam ${q.count - this.progress} ${q.label}. Volte quando terminar!`]);
    } else {
      g.ui.showDialog('Ancião Aldric', q.outro, () => {
        g.player.gainXp(q.xp);
        g.player.skillPoints += q.points;
        g.ui.log(`Missão concluída! +${q.xp} XP e +${q.points} ponto(s) de habilidade`, 'gold');
        g.ui.refreshSkills();
        g.sfx('quest');
        this.i++;
        this.state = 'available';
        this.progress = 0;
      });
    }
  }

  onKill(typeId) {
    const q = this.q;
    if (!q || this.state !== 'active' || typeId !== q.target) return;
    this.progress++;
    if (this.progress >= q.count) {
      this.state = 'complete';
      this.g.ui.log('Objetivo concluído! Volte ao Ancião Aldric na vila.', 'gold');
      this.g.sfx('quest');
    }
  }

  text() {
    const q = this.q;
    if (!q) return '<b>Lenda de Aether</b><br>Todas as missões concluídas!';
    if (this.state === 'available') return `<b>${q.title}</b><br>Fale com o Ancião Aldric na vila <span class="key">E</span>`;
    if (this.state === 'complete') return `<b>${q.title}</b><br>✔ Volte ao Ancião Aldric`;
    return `<b>${q.title}</b><br>Derrote ${q.label}: ${this.progress}/${q.count}`;
  }
}
