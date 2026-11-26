/**
 * 🎭 Projeto de PICO - Editor de diálogos ramificados
 * 📦 @version 1.0.0
 * 🌐 Compatibilidade alvo: recursos lançados até começo de 2023
 *
 * Modelo de dados (persistido no localStorage):
 *   Projeto: { name, scenes[] }
 *   Cena:    { id, scene (nome), cenario, nodes[], edges[], sel }
 *   Nó:      { id, uuid, type ('fala'|'escolha'), speaker, pose, cond, text, audio, x, y }
 *   Ligação: { a (id de origem), b (id de destino) }
 *
 * Os nomes dos campos persistidos foram mantidos para não invalidar projetos já salvos.
 * Todo acesso ao DOM acontece dentro de init(), que só roda depois do DOM estar pronto.
 */

/* ==================== Constantes ==================== */

const storage_key = `projeto-pico-v1`;
const svg_namespace = `http://www.w3.org/2000/svg`;
const color_primary = `#0b5a4e`;
const color_danger = `#b03a2e`;
const color_choice = `#b7791f`;
const color_no_speaker = `#6b7772`;
const node_width = 210;
const node_height_estimate = 70;
const level_spacing_x = 280;
const row_spacing_y = 125;
const layout_margin = 40;
const default_pan = { x: 30, y: 40 };
const pose_suggestions = [`neutra`, `feliz`, `triste`, `brava`, `surpresa`];
const sound_icon_path = `M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM389.8 307.7C380.7 301.4 368.3 303.6 362 312.7C355.7 321.8 357.9 334.2 367 340.5C390.9 357.2 406.4 384.8 406.4 416C406.4 447.2 390.8 474.9 367 491.5C357.9 497.8 355.7 510.3 362 519.3C368.3 528.3 380.8 530.6 389.8 524.3C423.9 500.5 446.4 460.8 446.4 416C446.4 371.2 424 331.5 389.8 307.7zM208 376C199.2 376 192 383.2 192 392L192 440C192 448.8 199.2 456 208 456L232 456L259.2 490C262.2 493.8 266.8 496 271.7 496L272 496C280.8 496 288 488.8 288 480L288 352C288 343.2 280.8 336 272 336L271.7 336C266.8 336 262.2 338.2 259.2 342L232 376L208 376zM336 448.2C336 458.9 346.5 466.4 354.9 459.8C367.8 449.5 376 433.7 376 416C376 398.3 367.8 382.5 354.9 372.2C346.5 365.5 336 373.1 336 383.8L336 448.3z`;

const sample_script = `# Cena: Encontro na taverna
# Cenário: Taverna do Corvo, noite de chuva
[inicio] Mara (neutra): Então você é a viajante de quem todos falam?
  * Aceitar a missão -> aceitar
  * Recusar com educação -> recusar
  * Perguntar o pagamento -> pagamento
[pagamento] Mara (feliz): Cem moedas de prata, metade agora.
  * [moedas >= 50] Fechar negócio -> aceitar
  * Desistir -> recusar
[aceitar] Mara (feliz): Ótimo. Partimos ao amanhecer.
  -> fim
[recusar] Mara (triste): Pena. A porta fica aberta se mudar de ideia.
  -> fim
[fim] Narrador: A noite cai sobre a taverna.`;

/* Expressões regulares: declaradas uma vez e reutilizadas. */
const scene_title_regex = /^#\s*cena:\s*(.+)/i;
const scene_setting_regex = /^#\s*cen[aá]rio:\s*(.+)/i;
const comment_regex = /^#/;
const dialogue_line_regex = /^\[([^\]]+)\]\s*(?:([^:(]{1,30}?)\s*(?:\(([^)]*)\))?\s*:)?\s*(.*)$/;
const choice_line_regex = /^\*\s*(?:\[([^\]]*)\]\s*)?(.*?)\s*->\s*(\S+)$/;
const link_line_regex = /^->\s*(\S+)/;
const xml_special_regex = /[&<>"]/;

const yaml_list_item_regex = /^-(?:\s+(.*))?$/;
const yaml_key_regex = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/;

const xml_entities = { '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;` };

const panel_storage_key = `projeto-pico-panels`;

const panel_settings = {
    left: { defaultWidth: 330, minWidth: 200, maxWidth: 600 },
    right: { defaultWidth: 290, minWidth: 220, maxWidth: 520 }
};

/* ==================== Estado ==================== */

let project = null;
let scene = null;
let panOffset = { x: default_pan.x, y: default_pan.y };
let dragState = null;
let exportFormat = `json`;
let resizingSide = null;
let nodeElements = {};

const panelState = {
    left: { width: panel_settings.left.defaultWidth, isCollapsed: false },
    right: { width: panel_settings.right.defaultWidth, isCollapsed: false }
};

const dom = {};

/* ==================== Construtores de elemento ==================== */

/**
 * Cria um elemento HTML.
 * @param {string} tagName
 * @param {Object} [properties] Propriedades do elemento. A chave "attributes" aceita um objeto de atributos.
 * @param {Node[]} [children]
 */
const createElement = (tagName, properties, children) => {

    const element = document.createElement(tagName);
    if( properties ) {

        for( const propertyName in properties ) {

            if( propertyName === `attributes` ) {

                for( const attributeName in properties.attributes ) {

                    element.setAttribute(attributeName, properties.attributes[attributeName]);

                }

            }
            else {

                element[propertyName] = properties[propertyName];

            }

        }

    }
    if( children ) {

        for( let index = 0; index < children.length; index++ ) {

            element.appendChild(children[index]);

        }

    }
    return element;

};

/** Cria um elemento SVG com os atributos informados. */
const createSvgElement = (tagName, attributes, children) => {

    const element = document.createElementNS(svg_namespace, tagName);
    for( const attributeName in attributes ) {

        element.setAttribute(attributeName, attributes[attributeName]);

    }
    if( children ) {

        for( let index = 0; index < children.length; index++ ) {

            element.appendChild(children[index]);

        }

    }
    return element;

};

/** Cria o ícone de arquivo de áudio (SVG). O tamanho e a cor ficam por conta do CSS. */
const createSoundIcon = () => {

    return createSvgElement(`svg`, {
        viewBox: `0 0 640 640`,
        class: `svg-sound-file audio-name`
    }, [
        createSvgElement(`path`, { d: sound_icon_path })
    ]);

};

/** Remove todos os filhos de um elemento. */
const clearElement = (element) => {

    while( element.lastChild ) {

        element.removeChild(element.lastChild);

    }

};

/**
 * Aplica vários estilos de uma vez a partir de pares [propriedade, valor].
 * A ordem não importa, então o laço é reverso.
 *
 * @param {HTMLElement|SVGElement} element Elemento que receberá os estilos
 * @param {Array<Array<string>>} styles Lista de pares, ex.: [[`left`, `10px`], [`top`, `5px`]]
 */
const applyStyles = (element, styles) => {

    let index = styles.length;

    while( index-- ) {

        element.style.setProperty(styles[index][0], styles[index][1]);

    }

};

/** Cria um <label> com o texto e o campo informados. */
const createField = (labelText, control) => {

    return createElement(`label`, null, [document.createTextNode(labelText), control]);

};

/** Cria um <datalist> com sugestões. */
const createDatalist = (listId, values) => {

    const datalist = createElement(`datalist`, { id: listId });
    for( let index = 0; index < values.length; index++ ) {

        datalist.appendChild(createElement(`option`, { value: values[index] }));

    }
    return datalist;

};

/* ==================== Utilitários ==================== */

/** Gera um UUID v4 com a API nativa do navegador. */
const generateUuid = () => crypto.randomUUID();

/** Escapa caracteres especiais para a exportação em XML. */
const escapeXml = (value) => {

    const text = (value === null || value === undefined) ? `` : String(value);
    if( !xml_special_regex.test(text) ) {

        return text;

    }
    let escaped = ``;
    for( let index = 0; index < text.length; index++ ) {

        const character = text.charAt(index);
        escaped += xml_entities[character] || character;

    }
    return escaped;

};

/** Retorna o nó da cena atual com o id informado, ou null. */
const findNode = (nodeId) => {

    for( let index = 0; index < scene.nodes.length; index++ ) {

        if( scene.nodes[index].id === nodeId ) {

            return scene.nodes[index];

        }

    }
    return null;

};

/** Lista os ids de destino das ligações que saem do nó. */
const getOutgoingIds = (nodeId, sourceScene) => {

    const targets = [];
    for( let index = 0; index < sourceScene.edges.length; index++ ) {

        if( sourceScene.edges[index].a === nodeId ) {

            targets.push(sourceScene.edges[index].b);

        }

    }
    return targets;

};

/** Indica se o nó é uma fala sem nenhuma ligação de saída. */
const isEndingNode = (node) => {

    return node.type === `fala` && getOutgoingIds(node.id, scene).length === 0;

};

/** Lista os interlocutores distintos da cena atual. */
const listSpeakers = () => {

    const seen = {};
    const speakers = [];
    for( let index = 0; index < scene.nodes.length; index++ ) {

        const speaker = scene.nodes[index].speaker;
        if( speaker && !seen[speaker] ) {

            seen[speaker] = true;
            speakers.push(speaker);

        }

    }
    return speakers;

};

/** Cor do nó: fixa para escolhas, derivada do nome para falas. */
const getNodeColor = (node) => {

    if( node.type === `escolha` ) {

        return color_choice;

    }
    if( !node.speaker ) {

        return color_no_speaker;

    }
    let hash = 7;
    for( let index = 0; index < node.speaker.length; index++ ) {

        hash = (hash * 31 + node.speaker.charCodeAt(index)) | 0;

    }
    return `hsl(` + (Math.abs(hash) % 360) + ` 50% 34%)`;

};

/* ==================== Diálogos (SweetAlert2 com fallback nativo) ==================== */

/** Pede confirmação ao usuário. Retorna Promise<boolean>. */
const askConfirmation = async (options) => {

    if( !window.Swal ) {

        return confirm(options.title);

    }
    const result = await Swal.fire({

        icon: `warning`,
        showCancelButton: true,
        confirmButtonColor: color_danger,
        cancelButtonText: `Cancelar`,
        title: options.title,
        text: options.text,
        confirmButtonText: options.confirmButtonText

    });
    return result.isConfirmed;

};

/**
 * Mostra um aviso informativo ou de erro.
 * Usa o Toastlet Notify e, se ele não tiver carregado, o SweetAlert2 ou o alert nativo.
 *
 * @param {string} icon `info` ou `error`
 */
const showAlert = (icon, title, text) => {

    if( window.toastletNotify ) {

        toastletNotify.notify(icon, text ? `${title}. ${text}` : title, { delay: 7000 });

        return;

    }

    if( !window.Swal ) {

        alert(title + (text ? `\n` + text : ``));
        return;

    }
    Swal.fire({ icon: icon, title: title, text: text, confirmButtonColor: color_primary });

};

/** Mostra uma notificação rápida de sucesso. Toastlet Notify, com SweetAlert2 como reserva. */
const showToast = (title) => {

    if( window.toastletNotify ) {

        toastletNotify.notify(`success`, title, { delay: 3000 });

        return;

    }

    if( !window.Swal ) {

        return;

    }
    Swal.fire({

        toast: true,
        position: `top-end`,
        icon: `success`,
        title: title,
        showConfirmButton: false,
        timer: 2000

    });

};

/** Pergunta o nome da nova cena. Retorna o texto ou null se cancelado. */
const askSceneName = async () => {

    if( !window.Swal ) {

        return prompt(`Nome da cena`, `Nova cena`);

    }
    const result = await Swal.fire({

        title: `Nova cena`,
        input: `text`,
        inputLabel: `Nome da cena`,
        inputValue: `Nova cena`,
        showCancelButton: true,
        confirmButtonText: `Criar`,
        cancelButtonText: `Cancelar`,
        confirmButtonColor: color_primary,
        inputValidator: (value) => {

            return value.trim() === `` ? `Dê um nome à cena` : null;

        }

    });
    return result.isConfirmed ? result.value : null;

};

/* ==================== Persistência ==================== */

/** Descarta campos transitórios (url do áudio e seleção) ao serializar. */
const persistenceReplacer = (key, value) => {

    if( key === `url` || key === `sel` ) {

        return undefined;

    }
    return value;

};

const saveProject = () => {

    try {

        localStorage.setItem(storage_key, JSON.stringify(project, persistenceReplacer));
        dom.savedLabel.textContent = `Salvo neste navegador`;

    }
    catch( error ) {

        dom.savedLabel.textContent = `Não foi possível salvar`;

    }

};

/** Carrega o projeto salvo ou cria um novo com a cena de exemplo. */
const loadProject = () => {

    try {

        project = JSON.parse(localStorage.getItem(storage_key));
        if( !project || !project.scenes || project.scenes.length === 0 ) {

            throw new Error(`Projeto vazio`);

        }

    }
    catch( error ) {

        project = { name: `Projeto de PICO`, scenes: [] };
        createScene(sample_script);
        saveProject();

    }

};

/** Cria uma cena a partir de um roteiro, adiciona ao projeto e a torna a cena atual. */
const createScene = (scriptText) => {

    scene = { id: generateUuid(), scene: ``, cenario: ``, nodes: [], edges: [], sel: null };
    project.scenes.push(scene);
    parseScript(scriptText);
    layoutNodes(false);
    return scene;

};

/* ==================== Roteiro <-> grafo ==================== */

/** Cria um nó, reaproveitando uuid, áudio e posição do nó anterior com o mesmo id. */
const buildNode = (nodeId, fields, previousNode) => {

    const node = {

        id: nodeId,
        uuid: previousNode ? previousNode.uuid : generateUuid(),
        audio: previousNode ? previousNode.audio : ``,
        url: previousNode ? previousNode.url : undefined,
        x: previousNode ? previousNode.x : undefined,
        y: previousNode ? previousNode.y : undefined,
        speaker: ``,
        pose: ``,
        cond: ``,
        text: ``

    };
    for( const fieldName in fields ) {

        node[fieldName] = fields[fieldName];

    }
    return node;

};

/**
 * Converte o roteiro em texto para nós e ligações da cena atual.
 * Preserva uuid, áudio e posição dos nós cujo id não mudou.
 */
const parseScript = (scriptText) => {

    const previousNodes = {};
    for( let index = 0; index < scene.nodes.length; index++ ) {

        previousNodes[scene.nodes[index].id] = scene.nodes[index];

    }

    const nodes = [];
    const rawEdges = [];
    let currentDialogueId = null;
    let choiceCount = 0;
    scene.scene = `Sem título`;
    scene.cenario = ``;

    const lines = scriptText.split(`\n`);
    for( let lineIndex = 0; lineIndex < lines.length; lineIndex++ ) {

        const line = lines[lineIndex].trim();
        if( line === `` ) {

            continue;

        }

        let match = scene_title_regex.exec(line);
        if( match ) {

            scene.scene = match[1];
            continue;

        }
        match = scene_setting_regex.exec(line);
        if( match ) {

            scene.cenario = match[1];
            continue;

        }
        if( comment_regex.test(line) ) {

            continue;

        }

        match = dialogue_line_regex.exec(line);
        if( match ) {

            currentDialogueId = match[1].trim();
            choiceCount = 0;
            nodes.push(buildNode(currentDialogueId, {

                type: `fala`,
                speaker: (match[2] || ``).trim(),
                pose: (match[3] || ``).trim(),
                text: match[4]

            }, previousNodes[currentDialogueId]));
            continue;

        }
        if( currentDialogueId === null ) {

            continue;

        }

        match = choice_line_regex.exec(line);
        if( match ) {

            choiceCount++;
            const choiceId = currentDialogueId + `_op` + choiceCount;
            nodes.push(buildNode(choiceId, {

                type: `escolha`,
                cond: (match[1] || ``).trim(),
                text: match[2]

            }, previousNodes[choiceId]));
            rawEdges.push({ a: currentDialogueId, b: choiceId });
            rawEdges.push({ a: choiceId, b: match[3] });
            continue;

        }

        match = link_line_regex.exec(line);
        if( match ) {

            rawEdges.push({ a: currentDialogueId, b: match[1] });

        }

    }

    const existingIds = {};
    for( let index = 0; index < nodes.length; index++ ) {

        existingIds[nodes[index].id] = true;

    }
    const seenEdges = {};
    const edges = [];
    for( let index = 0; index < rawEdges.length; index++ ) {

        const edge = rawEdges[index];
        const edgeKey = edge.a + `>` + edge.b;
        if( existingIds[edge.a] && existingIds[edge.b] && !seenEdges[edgeKey] ) {

            seenEdges[edgeKey] = true;
            edges.push(edge);

        }

    }

    scene.nodes = nodes;
    scene.edges = edges;
    if( !findNode(scene.sel) ) {

        scene.sel = null;

    }

};

/** Converte a cena atual de volta para o roteiro em texto. */
const buildScript = () => {

    const lines = [`# Cena: ` + scene.scene];
    if( scene.cenario ) {

        lines.push(`# Cenário: ` + scene.cenario);

    }

    for( let nodeIndex = 0; nodeIndex < scene.nodes.length; nodeIndex++ ) {

        const node = scene.nodes[nodeIndex];
        if( node.type !== `fala` ) {

            continue;

        }
        let prefix = ``;
        if( node.speaker ) {

            prefix = node.speaker + (node.pose ? ` (` + node.pose + `)` : ``) + `: `;

        }
        lines.push(`[` + node.id + `] ` + prefix + node.text);

        const targets = getOutgoingIds(node.id, scene);
        for( let targetIndex = 0; targetIndex < targets.length; targetIndex++ ) {

            const target = findNode(targets[targetIndex]);
            if( target && target.type === `escolha` ) {

                const destinations = getOutgoingIds(target.id, scene);
                if( destinations.length > 0 ) {

                    const condition = target.cond ? `[` + target.cond + `] ` : ``;
                    lines.push(`  * ` + condition + target.text + ` -> ` + destinations[0]);

                }

            }
            else {

                lines.push(`  -> ` + targets[targetIndex]);

            }

        }

    }
    return lines.join(`\n`);

};

/** Reescreve o roteiro a partir do grafo e salva o projeto. */
const syncScriptAndSave = () => {

    dom.scriptInput.value = buildScript();
    saveProject();

};

/* ==================== Layout automático ==================== */

/**
 * Distribui os nós em colunas pela profundidade no grafo.
 * @param {boolean} repositionAll Se false, só posiciona nós sem coordenadas.
 */
const layoutNodes = (repositionAll) => {

    const levels = {};
    const incomingCount = {};
    const nodeCount = scene.nodes.length;

    for( let index = 0; index < nodeCount; index++ ) {

        incomingCount[scene.nodes[index].id] = 0;

    }
    for( let index = 0; index < scene.edges.length; index++ ) {

        incomingCount[scene.edges[index].b]++;

    }

    let hasRoot = false;
    for( let index = 0; index < nodeCount; index++ ) {

        if( incomingCount[scene.nodes[index].id] === 0 ) {

            levels[scene.nodes[index].id] = 0;
            hasRoot = true;

        }

    }
    if( !hasRoot && nodeCount > 0 ) {

        levels[scene.nodes[0].id] = 0;

    }

    /* Relaxamento: empurra cada destino para depois da origem. O limite protege contra ciclos. */
    for( let pass = 0; pass < nodeCount; pass++ ) {

        for( let index = 0; index < scene.edges.length; index++ ) {

            const edge = scene.edges[index];
            const sourceLevel = levels[edge.a];
            if( sourceLevel === undefined || sourceLevel >= nodeCount ) {

                continue;

            }
            if( levels[edge.b] === undefined || levels[edge.b] < sourceLevel + 1 ) {

                levels[edge.b] = sourceLevel + 1;

            }

        }

    }

    const rowsPerLevel = {};
    for( let index = 0; index < nodeCount; index++ ) {

        const node = scene.nodes[index];
        const level = levels[node.id] || 0;
        const row = rowsPerLevel[level] || 0;
        if( repositionAll || node.x === undefined || node.x === null ) {

            node.x = layout_margin + level * level_spacing_x;
            node.y = layout_margin + row * row_spacing_y;

        }
        rowsPerLevel[level] = row + 1;

    }

};

/* ==================== Renderização do editor ==================== */

/** Cria o elemento de um nó do grafo. */
const createNodeElement = (node) => {

    let className = `node ` + node.type;
    if( isEndingNode(node) ) {

        className += ` end`;

    }
    if( scene.sel === node.id ) {

        className += ` sel`;

    }

    const title = createElement(`span`);
    if( node.type === `fala` ) {

        title.appendChild(document.createTextNode(node.speaker || `Sem nome`));
        if( node.pose ) {

            title.appendChild(document.createTextNode(` `));
            title.appendChild(createElement(`em`, { textContent: `(` + node.pose + `)` }));

        }

    }
    else {

        title.textContent = `Escolha`;

    }

    const element = createElement(`div`, { className: className }, [
        createElement(`div`, { className: `hd` }, [title, createElement(`small`, { textContent: node.id })]),
        createElement(`p`, { textContent: node.text || `…` })
    ]);
    element.dataset.id = node.id;
    applyStyles(element, [
        [`left`, `${node.x}px`],
        [`top`, `${node.y}px`],
        [`--c`, getNodeColor(node)]
    ]);

    if( node.cond ) {

        element.appendChild(createElement(`span`, { className: `au`, textContent: `se ` + node.cond }));

    }
    if( node.audio ) {

        element.appendChild(createElement(`span`, { className: `au` }, [
            createSoundIcon(),
            document.createTextNode(` ` + node.audio)
        ]));

    }
    element.appendChild(createElement(`i`, { className: `port in` }));
    element.appendChild(createElement(`i`, { className: `port out` }));
    return element;

};

/** Redesenha nós, ligações e legenda da cena atual. */
const renderScene = () => {

    clearElement(dom.nodesLayer);
    nodeElements = {};
    const fragment = document.createDocumentFragment();
    for( let index = 0; index < scene.nodes.length; index++ ) {

        const element = createNodeElement(scene.nodes[index]);
        nodeElements[scene.nodes[index].id] = element;
        fragment.appendChild(element);

    }
    dom.nodesLayer.appendChild(fragment);

    renderEdges();
    renderLegend();

};

/** Posição de um conector do nó. Saída fica à direita, entrada à esquerda. */
const getPortPosition = (nodeId, isOutput) => {

    const node = findNode(nodeId);
    const element = nodeElements[nodeId];
    return {

        x: node.x + (isOutput ? element.offsetWidth : 0),
        y: node.y + element.offsetHeight / 2

    };

};

/** Gera o atributo "d" de uma curva de Bézier entre dois pontos. */
const buildCurvePath = (from, to) => {

    const offset = Math.max(50, Math.abs(to.x - from.x) / 2);
    return `M` + from.x + ` ` + from.y +
        `C` + (from.x + offset) + ` ` + from.y +
        ` ` + (to.x - offset) + ` ` + to.y +
        ` ` + to.x + ` ` + to.y;

};

/** Remove uma ligação da cena atual. */
const removeEdge = (edge) => {

    for( let index = scene.edges.length - 1; index >= 0; index-- ) {

        if( scene.edges[index] === edge ) {

            scene.edges.splice(index, 1);
            break;

        }

    }
    renderScene();
    syncScriptAndSave();

};

/** Redesenha apenas as ligações (usado também durante o arraste de nós). */
const renderEdges = () => {

    clearElement(dom.edgesGroup);
    const fragment = document.createDocumentFragment();
    for( let index = 0; index < scene.edges.length; index++ ) {

        const edge = scene.edges[index];
        const pathData = buildCurvePath(getPortPosition(edge.a, true), getPortPosition(edge.b, false));

        const title = createSvgElement(`title`, {});
        title.textContent = `Clique para remover a ligação`;
        const group = createSvgElement(`g`, { class: `eg` }, [
            createSvgElement(`path`, { class: `hit`, d: pathData }, [title]),
            createSvgElement(`path`, { class: `e`, d: pathData, 'marker-end': `url(#ar)` })
        ]);
        group.addEventListener(`click`, () => removeEdge(edge));
        fragment.appendChild(group);

    }
    dom.edgesGroup.appendChild(fragment);

};

/** Atualiza a legenda de cores por interlocutor. */
const renderLegend = () => {

    clearElement(dom.legend);
    const speakers = listSpeakers();
    const addLegendItem = (label, color) => {

        const swatch = createElement(`b`);
        applyStyles(swatch, [[`background`, color]]);
        dom.legend.appendChild(createElement(`span`, null, [swatch, document.createTextNode(label)]));

    };
    for( let index = 0; index < speakers.length; index++ ) {

        addLegendItem(speakers[index], getNodeColor({ type: `fala`, speaker: speakers[index] }));

    }
    addLegendItem(`Escolha`, color_choice);

};

const applyPan = () => {

    applyStyles(dom.world, [[`transform`, `translate(${panOffset.x}px, ${panOffset.y}px)`]]);

};

/** Converte coordenadas do ponteiro para coordenadas do mundo (canvas com pan). */
const getWorldPosition = (event) => {

    const bounds = dom.canvas.getBoundingClientRect();
    return {

        x: event.clientX - bounds.left - panOffset.x,
        y: event.clientY - bounds.top - panOffset.y

    };

};

/** Seleciona um nó (ou nenhum, com null) e atualiza o inspetor. */
const selectNode = (nodeId) => {

    scene.sel = nodeId;
    for( const id in nodeElements ) {

        nodeElements[id].classList.toggle(`sel`, id === nodeId);

    }
    renderInspector();

};

/* ==================== Inspetor ==================== */

const countEndings = () => {

    let total = 0;
    for( let index = 0; index < scene.nodes.length; index++ ) {

        if( isEndingNode(scene.nodes[index]) ) {

            total++;

        }

    }
    return total;

};

/** Painel de configurações da cena (nenhum nó selecionado). */
const renderSceneSettings = () => {

    const nameInput = createElement(`input`, { type: `text`, value: scene.scene });
    const settingInput = createElement(`textarea`, {

        rows: 3,
        value: scene.cenario,
        placeholder: `Onde e quando a cena acontece`

    });

    nameInput.addEventListener(`input`, (event) => {

        scene.scene = event.target.value;
        dom.sceneLabel.textContent = scene.scene;
        syncScriptAndSave();

    });
    settingInput.addEventListener(`input`, (event) => {

        scene.cenario = event.target.value;
        syncScriptAndSave();

    });

    clearElement(dom.inspector);
    dom.inspector.appendChild(createElement(`h3`, { textContent: `Configurações da cena` }));
    dom.inspector.appendChild(createField(`Nome`, nameInput));
    dom.inspector.appendChild(createField(`Cenário`, settingInput));
    dom.inspector.appendChild(createElement(`p`, {

        className: `hint`,
        textContent: scene.nodes.length + ` nós, ` + scene.edges.length + ` ligações, ` + countEndings() + ` finais.`

    }));
    dom.inspector.appendChild(createElement(`p`, {

        className: `hint`,
        textContent: `Selecione um nó para editar. Arraste do círculo à direita de um nó até outro para ` +
            `ligá-los. Clique numa seta para removê-la.`

    }));

};

/** Painel de edição de um nó (fala ou escolha). */
const renderNodeSettings = (node) => {

    const isDialogue = node.type === `fala`;
    const applyChange = () => {

        renderScene();
        syncScriptAndSave();

    };

    clearElement(dom.inspector);
    dom.inspector.appendChild(createElement(`h3`, {

        textContent: (isDialogue ? `Fala` : `Escolha`) + `, ` + node.id

    }));

    if( isDialogue ) {

        const speakerInput = createElement(`input`, {

            type: `text`,
            value: node.speaker,
            attributes: { list: `speaker-options` }

        });
        const poseInput = createElement(`input`, {

            type: `text`,
            value: node.pose,
            attributes: { list: `pose-options` }

        });
        speakerInput.addEventListener(`input`, (event) => {

            node.speaker = event.target.value;
            applyChange();

        });
        poseInput.addEventListener(`input`, (event) => {

            node.pose = event.target.value;
            applyChange();

        });
        dom.inspector.appendChild(createField(`Interlocutor`, speakerInput));
        dom.inspector.appendChild(createDatalist(`speaker-options`, listSpeakers()));
        dom.inspector.appendChild(createField(`Pose`, poseInput));
        dom.inspector.appendChild(createDatalist(`pose-options`, pose_suggestions));

    }

    const textInput = createElement(`textarea`, { rows: 5, value: node.text });
    textInput.addEventListener(`input`, (event) => {

        node.text = event.target.value;
        applyChange();

    });
    dom.inspector.appendChild(createField(`Texto`, textInput));

    if( !isDialogue ) {

        const conditionInput = createElement(`input`, {

            type: `text`,
            value: node.cond,
            placeholder: `ex.: moedas >= 50`

        });
        conditionInput.addEventListener(`input`, (event) => {

            node.cond = event.target.value;
            applyChange();

        });
        dom.inspector.appendChild(createField(`Condição para aparecer`, conditionInput));

    }

    dom.inspector.appendChild(createField(`UUID`, createElement(`code`, { textContent: node.uuid })));

    if( isDialogue ) {

        const audioInput = createElement(`input`, { type: `file`, accept: `audio/*` });
        audioInput.addEventListener(`change`, (event) => {

            const file = event.target.files[0];
            if( !file ) {

                return;

            }
            node.audio = file.name;
            node.url = URL.createObjectURL(file);
            applyChange();
            renderInspector();

        });
        dom.inspector.appendChild(createField(`Áudio`, audioInput));
        if( node.audio ) {

            dom.inspector.appendChild(createElement(`span`, { className: `au` }, [
                createSoundIcon(),
                document.createTextNode(` ` + node.audio)
            ]));

        }
        if( node.url ) {

            dom.inspector.appendChild(createElement(`audio`, { controls: true, src: node.url }));

        }

    }

    const deleteButton = createElement(`button`, { className: `danger`, textContent: `Excluir nó` });
    deleteButton.addEventListener(`click`, deleteSelectedNode);
    dom.inspector.appendChild(deleteButton);

};

/** Mostra o painel da cena ou do nó selecionado. */
const renderInspector = () => {

    const node = findNode(scene.sel);
    if( node ) {

        renderNodeSettings(node);

    }
    else {

        renderSceneSettings();

    }

    const rail = dom.panels.right.rail;

    rail.classList.toggle(`has-selection`, node !== null);

    if( node ) {

        applyStyles(rail, [[`--c`, getNodeColor(node)]]);

    }

};

/* ==================== Edição do grafo ==================== */

/** Exclui o nó selecionado e todas as ligações que passam por ele. */
const deleteSelectedNode = () => {

    if( !scene || !scene.sel || document.body.classList.contains(`on-home`) ) {

        return;

    }
    const removedId = scene.sel;
    const remainingNodes = [];
    for( let index = 0; index < scene.nodes.length; index++ ) {

        if( scene.nodes[index].id !== removedId ) {

            remainingNodes.push(scene.nodes[index]);

        }

    }
    const remainingEdges = [];
    for( let index = 0; index < scene.edges.length; index++ ) {

        const edge = scene.edges[index];
        if( edge.a !== removedId && edge.b !== removedId ) {

            remainingEdges.push(edge);

        }

    }
    scene.nodes = remainingNodes;
    scene.edges = remainingEdges;
    scene.sel = null;
    renderScene();
    renderInspector();
    syncScriptAndSave();

};

/** Adiciona um nó novo no centro da área visível. */
const addNode = (type) => {

    let suffix = 1;
    while( findNode(`no` + suffix) ) {

        suffix++;

    }
    const nodeId = `no` + suffix;
    const bounds = dom.canvas.getBoundingClientRect();
    scene.nodes.push({

        id: nodeId,
        uuid: generateUuid(),
        type: type,
        speaker: ``,
        pose: ``,
        cond: ``,
        text: type === `fala` ? `Nova fala` : `Nova opção`,
        audio: ``,
        x: Math.round(bounds.width / 2 - panOffset.x - node_width / 2 + (suffix % 5) * 14),
        y: Math.round(bounds.height / 2 - panOffset.y - 40 + (suffix % 5) * 14)

    });
    renderScene();
    selectNode(nodeId);
    syncScriptAndSave();

};

/** Compila o roteiro digitado e redesenha o grafo. */
const compileScript = () => {

    parseScript(dom.scriptInput.value);
    layoutNodes(false);
    renderScene();
    renderInspector();
    dom.sceneLabel.textContent = scene.scene;
    saveProject();

};

/* ==================== Interação no canvas ==================== */

const handlePointerDown = (event) => {

    if( event.target.closest(`.eg`) ) {

        return;

    }
    const nodeElement = event.target.closest(`.node`);
    const nodeId = nodeElement ? nodeElement.dataset.id : null;

    if( nodeElement && event.target.closest(`.port.out`) ) {

        dragState = { type: `link`, from: nodeId };

    }
    else if( nodeElement ) {

        const node = findNode(nodeId);
        const position = getWorldPosition(event);
        selectNode(nodeId);
        dragState = { type: `move`, node: node, offsetX: position.x - node.x, offsetY: position.y - node.y };

    }
    else {

        selectNode(null);
        dragState = { type: `pan`, startX: event.clientX - panOffset.x, startY: event.clientY - panOffset.y };

    }
    dom.canvas.setPointerCapture(event.pointerId);

};

const handlePointerMove = (event) => {

    if( !dragState ) {

        return;

    }
    if( dragState.type === `pan` ) {

        panOffset = { x: event.clientX - dragState.startX, y: event.clientY - dragState.startY };
        applyPan();

    }
    else if( dragState.type === `move` ) {

        const position = getWorldPosition(event);
        const node = dragState.node;
        node.x = Math.round(position.x - dragState.offsetX);
        node.y = Math.round(position.y - dragState.offsetY);
        applyStyles(nodeElements[node.id], [
            [`left`, `${node.x}px`],
            [`top`, `${node.y}px`]
        ]);
        renderEdges();

    }
    else {

        dom.tempEdge.setAttribute(`d`, buildCurvePath(getPortPosition(dragState.from, true), getWorldPosition(event)));

    }

};

const edgeExists = (sourceId, targetId) => {

    for( let index = 0; index < scene.edges.length; index++ ) {

        if( scene.edges[index].a === sourceId && scene.edges[index].b === targetId ) {

            return true;

        }

    }
    return false;

};

const handlePointerUp = (event) => {

    if( dragState && dragState.type === `link` ) {

        dom.tempEdge.setAttribute(`d`, ``);
        const dropped = document.elementFromPoint(event.clientX, event.clientY);
        const targetElement = dropped ? dropped.closest(`.node`) : null;
        const targetId = targetElement ? targetElement.dataset.id : null;
        if( targetId && targetId !== dragState.from && !edgeExists(dragState.from, targetId) ) {

            scene.edges.push({ a: dragState.from, b: targetId });
            renderScene();
            syncScriptAndSave();

        }

    }
    if( dragState && dragState.type === `move` ) {

        saveProject();

    }
    dragState = null;

};

/* ==================== Tela inicial ==================== */

/** Miniatura SVG do grafo de uma cena, para o card da tela inicial. */
const buildThumbnail = (sourceScene) => {

    const nodes = sourceScene.nodes;
    if( nodes.length === 0 ) {

        return null;

    }
    const nodesById = {};
    let minX = nodes[0].x;
    let minY = nodes[0].y;
    let maxX = nodes[0].x;
    let maxY = nodes[0].y;
    for( let index = 0; index < nodes.length; index++ ) {

        const node = nodes[index];
        nodesById[node.id] = node;
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);

    }
    const width = maxX - minX + node_width;
    const height = maxY - minY + node_height_estimate;
    const svg = createSvgElement(`svg`, {

        viewBox: (minX - 10) + ` ` + (minY - 10) + ` ` + (width + 20) + ` ` + (height + 20)

    });

    for( let index = 0; index < sourceScene.edges.length; index++ ) {

        const source = nodesById[sourceScene.edges[index].a];
        const target = nodesById[sourceScene.edges[index].b];
        if( source && target ) {

            svg.appendChild(createSvgElement(`path`, {

                d: buildCurvePath(
                    { x: source.x + node_width, y: source.y + node_height_estimate / 2 },
                    { x: target.x, y: target.y + node_height_estimate / 2 }
                ),
                stroke: `#9aa7a2`,
                'stroke-width': 5,
                fill: `none`

            }));

        }

    }
    for( let index = 0; index < nodes.length; index++ ) {

        svg.appendChild(createSvgElement(`rect`, {

            x: nodes[index].x,
            y: nodes[index].y,
            width: node_width,
            height: node_height_estimate,
            rx: nodes[index].type === `escolha` ? 35 : 12,
            fill: getNodeColor(nodes[index])

        }));

    }
    return svg;

};

/** Cria o card de uma cena, com miniatura, resumo e ações. */
const createSceneCard = (sourceScene) => {

    let dialogueCount = 0;
    for( let index = 0; index < sourceScene.nodes.length; index++ ) {

        if( sourceScene.nodes[index].type === `fala` ) {

            dialogueCount++;

        }

    }
    const choiceCount = sourceScene.nodes.length - dialogueCount;

    const thumbnail = createElement(`div`, { className: `th` });
    const thumbnailSvg = buildThumbnail(sourceScene);
    if( thumbnailSvg ) {

        thumbnail.appendChild(thumbnailSvg);

    }

    const duplicateButton = createElement(`button`, { textContent: `Duplicar` });
    duplicateButton.addEventListener(`click`, (event) => {

        event.stopPropagation();
        duplicateScene(sourceScene.id);

    });
    const deleteButton = createElement(`button`, { className: `danger`, textContent: `Excluir` });
    deleteButton.addEventListener(`click`, (event) => {

        event.stopPropagation();
        deleteScene(sourceScene.id);

    });

    const card = createElement(`article`, { className: `card` }, [
        thumbnail,
        createElement(`h4`, { textContent: sourceScene.scene }),
        createElement(`p`, {

            textContent: dialogueCount + ` falas, ` + choiceCount + ` escolhas, ` + sourceScene.edges.length + ` ligações`

        }),
        createElement(`div`, { className: `ca` }, [duplicateButton, deleteButton])
    ]);
    card.addEventListener(`click`, () => openScene(sourceScene.id));
    return card;

};

/** Mostra a tela inicial com os cards das cenas. */
const showHome = () => {

    document.body.classList.add(`on-home`);
    dom.projectNameInput.value = project.name;
    clearElement(dom.cards);

    const fragment = document.createDocumentFragment();
    for( let index = 0; index < project.scenes.length; index++ ) {

        fragment.appendChild(createSceneCard(project.scenes[index]));

    }

    const newButton = createElement(`button`, { className: `card newc`, textContent: `+ Nova cena` });
    newButton.addEventListener(`click`, handleNewScene);

    const importButton = createElement(`button`, { className: `card newc`, textContent: `Importar JSON, XML ou YAML` });
    importButton.addEventListener(`click`, () => dom.importInput.click());

    const tutorialButton = createElement(`button`, { className: `card newc`, textContent: `Como usar (tutorial)` });
    tutorialButton.addEventListener(`click`, () => window.location.assign(`tutorial.html`));

    fragment.appendChild(newButton);
    fragment.appendChild(importButton);
    fragment.appendChild(tutorialButton);

    dom.cards.appendChild(fragment);

};

/** Abre uma cena no editor. */
const openScene = (sceneId) => {

    for( let index = 0; index < project.scenes.length; index++ ) {

        if( project.scenes[index].id === sceneId ) {

            scene = project.scenes[index];
            break;

        }

    }
    scene.sel = null;
    panOffset = { x: default_pan.x, y: default_pan.y };
    applyPan();
    document.body.classList.remove(`on-home`);
    dom.sceneLabel.textContent = scene.scene;
    dom.scriptInput.value = buildScript();
    renderScene();
    renderInspector();

};

const handleNewScene = async () => {

    const name = await askSceneName();
    if( name && name.trim() !== `` ) {

        createScene(`# Cena: ` + name.trim() + `\n[inicio] Personagem: Olá!`);
        saveProject();
        openScene(scene.id);

    }

};

/** Remove a cena do projeto, se não for a última. */
const deleteScene = async (sceneId) => {

    if( project.scenes.length < 2 ) {

        showAlert(`info`, `Não dá para excluir`, `O projeto precisa ter ao menos uma cena.`);
        return;

    }
    const confirmed = await askConfirmation({

        title: `Excluir esta cena?`,
        text: `Os nós e as ligações dela serão apagados.`,
        confirmButtonText: `Excluir`

    });
    if( !confirmed ) {

        return;

    }
    const remaining = [];
    for( let index = 0; index < project.scenes.length; index++ ) {

        if( project.scenes[index].id !== sceneId ) {

            remaining.push(project.scenes[index]);

        }

    }
    project.scenes = remaining;
    saveProject();
    showHome();
    showToast(`Cena excluída`);

};

/** Duplica uma cena gerando novos UUIDs para seus nós. */
const duplicateScene = (sceneId) => {

    for( let index = 0; index < project.scenes.length; index++ ) {

        if( project.scenes[index].id === sceneId ) {

            const copy = JSON.parse(JSON.stringify(project.scenes[index]));
            copy.id = generateUuid();
            copy.scene = copy.scene + ` (cópia)`;
            for( let nodeIndex = 0; nodeIndex < copy.nodes.length; nodeIndex++ ) {

                copy.nodes[nodeIndex].uuid = generateUuid();

            }
            project.scenes.push(copy);
            break;

        }

    }
    saveProject();
    showHome();
    showToast(`Cena duplicada`);

};

/* ==================== Importação e exportação ==================== */

/**
 * Cria uma cena a partir do JSON exportado pelo editor.
 * Lança Error se o formato for inválido.
 */
const importSceneData = (data) => {

    if( !data || !data.nos || data.nos.length === 0 ) {

        throw new Error(`O arquivo não tem a lista "nos" no formato exportado pelo editor.`);

    }
    const importedIds = {};
    for( let index = 0; index < data.nos.length; index++ ) {

        const nodeId = String(data.nos[index].id);
        if( importedIds[nodeId] ) {

            throw new Error(`Há nós com ids repetidos.`);

        }
        importedIds[nodeId] = true;

    }

    const usedUuids = {};
    for( let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex++ ) {

        const nodes = project.scenes[sceneIndex].nodes;
        for( let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++ ) {

            usedUuids[nodes[nodeIndex].uuid] = true;

        }

    }

    const imported = {

        id: generateUuid(),
        scene: data.cena || `Cena importada`,
        cenario: data.cenario || ``,
        nodes: [],
        edges: [],
        sel: null

    };
    for( let index = 0; index < data.nos.length; index++ ) {

        const source = data.nos[index];
        const nodeId = String(source.id);
        const keepUuid = source.uuid && !usedUuids[source.uuid];
        imported.nodes.push({

            id: nodeId,
            uuid: keepUuid ? source.uuid : generateUuid(),
            type: source.tipo === `escolha` ? `escolha` : `fala`,
            speaker: source.interlocutor || ``,
            pose: source.pose || ``,
            text: source.texto || ``,
            cond: source.condicao || ``,
            audio: source.audio || ``

        });
        const targets = source.proximos || [];
        for( let targetIndex = 0; targetIndex < targets.length; targetIndex++ ) {

            if( importedIds[String(targets[targetIndex])] ) {

                imported.edges.push({ a: nodeId, b: String(targets[targetIndex]) });

            }

        }

    }

    scene = imported;
    project.scenes.push(imported);
    layoutNodes(false);
    return imported;

};

/**
 * Descobre o formato do arquivo pela extensão.
 * Se a extensão não ajudar, olha o primeiro caractere do conteúdo.
 *
 * @param {string} fileName Nome do arquivo escolhido
 * @param {string} content Conteúdo do arquivo
 * @returns {string} `json`, `xml` ou `yaml`
 */
const detectImportFormat = (fileName, content) => {

    const lowerName = fileName.toLowerCase();

    if( lowerName.slice(-5) === `.json` ) {

        return `json`;

    }

    if( lowerName.slice(-4) === `.xml` ) {

        return `xml`;

    }

    if( lowerName.slice(-5) === `.yaml` || lowerName.slice(-4) === `.yml` ) {

        return `yaml`;

    }

    const firstCharacter = content.trim().charAt(0);

    if( firstCharacter === `{` ) {

        return `json`;

    }

    return firstCharacter === `<` ? `xml` : `yaml`;

};

/** Lê o texto de um elemento filho do XML, ou null se ele não existir. */
const readXmlText = (parentElement, tagName) => {

    const found = parentElement.getElementsByTagName(tagName);

    return found.length > 0 ? found[0].textContent : null;

};

/**
 * Converte o XML exportado pelo editor para o modelo neutro (o mesmo do JSON).
 * Lança Error se o XML for inválido ou não tiver o elemento <cena>.
 */
const parseXmlToModel = (xmlText) => {

    const xmlDocument = new DOMParser().parseFromString(xmlText, `application/xml`);

    if( xmlDocument.getElementsByTagName(`parsererror`).length > 0 ) {

        throw new Error(`O arquivo não é um XML válido.`);

    }

    const sceneElement = xmlDocument.documentElement;

    if( sceneElement.tagName !== `cena` ) {

        throw new Error(`O XML precisa ter o elemento raiz <cena>.`);

    }

    const model = {
        cena: sceneElement.getAttribute(`nome`),
        cenario: readXmlText(sceneElement, `cenario`),
        nos: []
    };
    const xmlNodes = sceneElement.getElementsByTagName(`no`);

    for( let index = 0; index < xmlNodes.length; index++ ) {

        const xmlNode = xmlNodes[index];
        const nextElements = xmlNode.getElementsByTagName(`proximo`);
        const nextIds = [];

        for( let nextIndex = 0; nextIndex < nextElements.length; nextIndex++ ) {

            nextIds.push(nextElements[nextIndex].getAttribute(`ref`));

        }

        model.nos.push({
            id: xmlNode.getAttribute(`id`),
            uuid: xmlNode.getAttribute(`uuid`),
            tipo: xmlNode.getAttribute(`tipo`),
            interlocutor: readXmlText(xmlNode, `interlocutor`),
            pose: readXmlText(xmlNode, `pose`),
            texto: readXmlText(xmlNode, `texto`),
            condicao: readXmlText(xmlNode, `condicao`),
            audio: readXmlText(xmlNode, `audio`),
            proximos: nextIds
        });

    }

    return model;

};

/**
 * Converte um valor YAML simples em JavaScript.
 * Suporta null, texto com aspas duplas ou simples, texto puro e listas em linha ([a, b]).
 */
const parseYamlScalar = (rawValue) => {

    const value = rawValue.trim();

    if( value === `` || value === `null` || value === `~` ) {

        return null;

    }

    const firstCharacter = value.charAt(0);

    if( firstCharacter === `"` ) {

        try {

            return JSON.parse(value);

        }
        catch( error ) {

            return value.slice(1, -1);

        }

    }

    if( firstCharacter === `'` ) {

        return value.slice(1, -1).split(`''`).join(`'`);

    }

    if( firstCharacter === `[` ) {

        try {

            return JSON.parse(value);

        }
        catch( error ) {

            const items = value.slice(1, -1).split(`,`);
            const parsedItems = [];

            for( let index = 0; index < items.length; index++ ) {

                if( items[index].trim() !== `` ) {

                    parsedItems.push(parseYamlScalar(items[index]));

                }

            }

            return parsedItems;

        }

    }

    return value;

};

/**
 * Converte o YAML exportado pelo editor para o modelo neutro (o mesmo do JSON).
 *
 * Não é um parser de YAML completo. Cobre o formato exportado e variações simples
 * escritas à mão: listas de nós com "- chave: valor", textos com ou sem aspas e
 * "proximos" em linha ou em lista com hífens. Âncoras, textos em várias linhas
 * e outras construções avançadas não são suportadas.
 */
const parseYamlToModel = (yamlText) => {

    const model = { cena: null, cenario: null, nos: [] };
    const lines = yamlText.split(`\n`);

    let currentNode = null;
    let listKey = null;
    let itemIndent = -1;

    for( let index = 0; index < lines.length; index++ ) {

        const rawLine = lines[index];
        const trimmed = rawLine.trim();

        if( trimmed === `` || trimmed.charAt(0) === `#` ) {

            continue;

        }

        const indent = rawLine.length - rawLine.trimStart().length;
        const itemMatch = yaml_list_item_regex.exec(trimmed);
        let content = trimmed;

        if( itemMatch ) {

            /* Item mais indentado que o nó atual, dentro de uma lista em bloco: é um valor de "proximos" */
            if( listKey !== null && currentNode && indent > itemIndent ) {

                currentNode[listKey].push(parseYamlScalar(itemMatch[1] || ``));

                continue;

            }

            currentNode = {};
            model.nos.push(currentNode);
            listKey = null;
            itemIndent = indent;
            content = itemMatch[1] || ``;

        }

        const pairMatch = yaml_key_regex.exec(content);

        if( !pairMatch ) {

            continue;

        }

        const key = pairMatch[1];
        const rawValue = pairMatch[2] || ``;

        if( !itemMatch && indent === 0 ) {

            listKey = null;

            if( key === `cena` || key === `cenario` ) {

                model[key] = parseYamlScalar(rawValue);

            }

            continue;

        }

        if( !currentNode ) {

            continue;

        }

        if( key === `proximos` && rawValue.trim() === `` ) {

            currentNode.proximos = [];
            listKey = `proximos`;

            continue;

        }

        listKey = null;
        currentNode[key] = parseYamlScalar(rawValue);

    }

    return model;

};

/** Importa um arquivo JSON, XML ou YAML escolhido pelo usuário como uma nova cena. */
const handleImportFile = async (event) => {

    const file = event.target.files[0];

    event.target.value = ``;

    if( !file ) {

        return;

    }

    try {

        const content = await file.text();
        const format = detectImportFormat(file.name, content);
        let model = null;

        if( format === `xml` ) {

            model = parseXmlToModel(content);

        }
        else if( format === `yaml` ) {

            model = parseYamlToModel(content);

        }
        else {

            model = JSON.parse(content);

        }

        const imported = importSceneData(model);

        saveProject();
        showHome();
        showToast(`Importada: ${imported.scene}`);

    }
    catch( error ) {

        const isSyntaxError = error instanceof SyntaxError;

        showAlert(`error`, `Não foi possível importar`, isSyntaxError ? `O arquivo não é um JSON válido.` : error.message);

    }

};

/** Representação neutra da cena atual, usada por todos os formatos de exportação. */
const buildExportModel = () => {

    const nodes = [];
    for( let index = 0; index < scene.nodes.length; index++ ) {

        const node = scene.nodes[index];
        nodes.push({

            id: node.id,
            uuid: node.uuid,
            tipo: node.type,
            interlocutor: node.speaker || null,
            pose: node.pose || null,
            texto: node.text,
            condicao: node.cond || null,
            audio: node.audio || null,
            proximos: getOutgoingIds(node.id, scene)

        });

    }
    return { cena: scene.scene, cenario: scene.cenario || null, nos: nodes };

};

/** Texto como literal entre aspas, ou "null" se vazio. */
const toQuotedOrNull = (value) => {

    return value ? JSON.stringify(value) : `null`;

};

const buildYaml = (model) => {

    let yaml = `cena: ` + toQuotedOrNull(model.cena) + `\n`;
    yaml += `cenario: ` + toQuotedOrNull(model.cenario) + `\nnos:\n`;
    for( let index = 0; index < model.nos.length; index++ ) {

        const node = model.nos[index];
        yaml += `  - id: ` + toQuotedOrNull(node.id) + `\n`;
        yaml += `    uuid: ` + node.uuid + `\n`;
        yaml += `    tipo: ` + node.tipo + `\n`;
        yaml += `    interlocutor: ` + toQuotedOrNull(node.interlocutor) + `\n`;
        yaml += `    pose: ` + toQuotedOrNull(node.pose) + `\n`;
        yaml += `    texto: ` + toQuotedOrNull(node.texto) + `\n`;
        yaml += `    condicao: ` + toQuotedOrNull(node.condicao) + `\n`;
        yaml += `    audio: ` + toQuotedOrNull(node.audio) + `\n`;
        yaml += `    proximos: ` + JSON.stringify(node.proximos) + `\n`;

    }
    return yaml;

};

const buildXml = (model) => {

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<cena nome="` + escapeXml(model.cena) + `">\n`;
    xml += `  <cenario>` + escapeXml(model.cenario) + `</cenario>\n`;
    for( let index = 0; index < model.nos.length; index++ ) {

        const node = model.nos[index];
        xml += `  <no id="` + escapeXml(node.id) + `" uuid="` + node.uuid + `" tipo="` + node.tipo + `">\n`;
        xml += `    <interlocutor>` + escapeXml(node.interlocutor) + `</interlocutor>\n`;
        xml += `    <pose>` + escapeXml(node.pose) + `</pose>\n`;
        xml += `    <texto>` + escapeXml(node.texto) + `</texto>\n`;
        xml += `    <condicao>` + escapeXml(node.condicao) + `</condicao>\n`;
        xml += `    <audio>` + escapeXml(node.audio) + `</audio>\n`;
        for( let targetIndex = 0; targetIndex < node.proximos.length; targetIndex++ ) {

            xml += `    <proximo ref="` + escapeXml(node.proximos[targetIndex]) + `"/>\n`;

        }
        xml += `  </no>\n`;

    }
    return xml + `</cena>\n`;

};

/** Atualiza o conteúdo e as abas do diálogo de exportação. */
const renderExport = () => {

    const model = buildExportModel();
    if( exportFormat === `xml` ) {

        dom.exportOutput.value = buildXml(model);

    }
    else if( exportFormat === `yaml` ) {

        dom.exportOutput.value = buildYaml(model);

    }
    else {

        dom.exportOutput.value = JSON.stringify(model, null, 2);

    }
    const tabs = dom.exportTabs.getElementsByTagName(`button`);
    for( let index = 0; index < tabs.length; index++ ) {

        tabs[index].classList.toggle(`on`, tabs[index].dataset.f === exportFormat);

    }

};

const downloadExport = () => {

    const link = createElement(`a`, {

        href: URL.createObjectURL(new Blob([dom.exportOutput.value], { type: `text/plain` })),
        download: `dialogos.` + exportFormat

    });
    link.click();

};

const copyExport = async () => {

    await navigator.clipboard.writeText(dom.exportOutput.value);
    dom.copyButton.textContent = `Copiado`;
    setTimeout(() => {

        dom.copyButton.textContent = `Copiar`;

    }, 1200);

};

/** Mantém a largura de um painel entre o mínimo e o máximo definidos para ele. */
const clampPanelWidth = (side, width) => {

    const settings = panel_settings[side];

    return Math.min(Math.max(width, settings.minWidth), settings.maxWidth);

};

/** Salva a largura e o estado (recolhido ou não) dos dois painéis. */
const savePanelState = () => {

    try {

        localStorage.setItem(panel_storage_key, JSON.stringify(panelState));

    }
    catch( error ) {

        /* Sem persistência, os painéis só voltam ao padrão no próximo carregamento */

    }

};

/** Lê do localStorage a largura e o estado salvos dos painéis. */
const loadPanelState = () => {

    try {

        const saved = JSON.parse(localStorage.getItem(panel_storage_key));

        if( !saved ) {

            return;

        }

        for( const side in panelState ) {

            const savedSide = saved[side];

            if( !savedSide ) {

                continue;

            }

            if( typeof savedSide.width === `number` ) {

                panelState[side].width = clampPanelWidth(side, savedSide.width);

            }

            panelState[side].isCollapsed = savedSide.isCollapsed === true;

        }

    }
    catch( error ) {

        /* Dados inválidos: mantém os valores padrão */

    }

};

/** Aplica ao DOM a largura e o estado atuais de um painel. */
const applyPanelState = (side) => {

    applyStyles(dom.panels[side].panel, [[`width`, `${panelState[side].width}px`]]);

    dom.editor.classList.toggle(`${side}-collapsed`, panelState[side].isCollapsed);

};

/** Recolhe ou mostra um painel. */
const togglePanel = (side) => {

    panelState[side].isCollapsed = !panelState[side].isCollapsed;

    applyPanelState(side);
    savePanelState();

};

/** Volta um painel à largura padrão. */
const resetPanelWidth = (side) => {

    panelState[side].width = panel_settings[side].defaultWidth;

    applyPanelState(side);
    savePanelState();

};

/** Liga os eventos de recolher, reabrir e redimensionar de um painel. */
const bindPanelEvents = (side) => {

    const elements = dom.panels[side];

    elements.hideButton.addEventListener(`click`, () => togglePanel(side));
    elements.rail.addEventListener(`click`, () => togglePanel(side));
    elements.resizer.addEventListener(`dblclick`, () => resetPanelWidth(side));

    elements.resizer.addEventListener(`pointerdown`, (event) => {

        resizingSide = side;

        elements.resizer.setPointerCapture(event.pointerId);

    });

    elements.resizer.addEventListener(`pointermove`, (event) => {

        if( resizingSide !== side ) {

            return;

        }

        const bounds = dom.editor.getBoundingClientRect();
        const width = side === `left` ? event.clientX - bounds.left : bounds.right - event.clientX;

        panelState[side].width = clampPanelWidth(side, width);

        applyPanelState(side);

    });

    elements.resizer.addEventListener(`pointerup`, () => {

        if( resizingSide !== side ) {

            return;

        }

        resizingSide = null;

        savePanelState();

    });

};

/** Ctrl+B recolhe o roteiro. Ctrl+Alt+B recolhe as propriedades. Só vale dentro do editor. */
const handlePanelShortcut = (event) => {

    const hasModifier = event.ctrlKey || event.metaKey;

    if( !hasModifier || event.code !== `KeyB` || document.body.classList.contains(`on-home`) ) {

        return;

    }

    event.preventDefault();

    togglePanel(event.altKey ? `right` : `left`);

};

/* ==================== Inicialização ==================== */

/** Guarda as referências dos elementos fixos. Só pode ser chamada com o DOM pronto. */
const cacheElements = () => {

    dom.projectNameLabel = document.getElementById(`pname`);
    dom.sceneLabel = document.getElementById(`sname`);
    dom.savedLabel = document.getElementById(`saved`);
    dom.backButton = document.getElementById(`back`);
    dom.exportButton = document.getElementById(`exp`);
    dom.autoLayoutButton = document.getElementById(`auto`);
    dom.compileButton = document.getElementById(`compile`);
    dom.projectNameInput = document.getElementById(`pn`);
    dom.cards = document.getElementById(`cards`);
    dom.scriptInput = document.getElementById(`src`);
    dom.canvas = document.getElementById(`canvas`);
    dom.world = document.getElementById(`world`);
    dom.edgesGroup = document.getElementById(`eg`);
    dom.tempEdge = document.getElementById(`tmp`);
    dom.nodesLayer = document.getElementById(`nodes`);
    dom.legend = document.getElementById(`legend`);
    dom.inspector = document.getElementById(`insp`);
    dom.exportDialog = document.getElementById(`dlg`);
    dom.closeDialogButton = document.getElementById(`x`);
    dom.exportOutput = document.getElementById(`out`);
    dom.copyButton = document.getElementById(`cp`);
    dom.downloadButton = document.getElementById(`dl`);
    dom.importInput = document.getElementById(`imp`);
    dom.exportTabs = document.getElementsByClassName(`tabs`)[0];
    dom.toolbar = document.getElementsByClassName(`tools`)[0];
    dom.editor = document.getElementsByTagName(`main`)[0];
    dom.panels = {};

    const sides = [`left`, `right`];

    for( let index = 0; index < sides.length; index++ ) {

        const side = sides[index];

        dom.panels[side] = {
            panel: document.getElementById(side),
            resizer: document.getElementById(`resizer-${side}`),
            rail: document.getElementById(`rail-${side}`),
            hideButton: document.getElementById(`hide-${side}`)
        };

    }

};

const bindEvents = () => {

    dom.canvas.addEventListener(`pointerdown`, handlePointerDown);
    dom.canvas.addEventListener(`pointermove`, handlePointerMove);
    dom.canvas.addEventListener(`pointerup`, handlePointerUp);
    dom.importInput.addEventListener(`change`, handleImportFile);
    dom.compileButton.addEventListener(`click`, compileScript);

    dom.scriptInput.addEventListener(`keydown`, (event) => {

        if( event.ctrlKey && event.key === `Enter` ) {

            event.preventDefault();
            compileScript();

        }

    });
    document.addEventListener(`keydown`, (event) => {

        const focusedTag = document.activeElement.tagName;
        if( event.key === `Delete` && focusedTag !== `INPUT` && focusedTag !== `TEXTAREA` ) {

            deleteSelectedNode();

        }

    });

    const toolbarButtons = dom.toolbar.getElementsByTagName(`button`);
    for( let index = 0; index < toolbarButtons.length; index++ ) {

        const nodeType = toolbarButtons[index].dataset.add;
        if( nodeType ) {

            toolbarButtons[index].addEventListener(`click`, () => addNode(nodeType));

        }

    }
    dom.autoLayoutButton.addEventListener(`click`, () => {

        layoutNodes(true);
        renderScene();
        saveProject();

    });

    dom.backButton.addEventListener(`click`, () => {

        saveProject();
        showHome();

    });
    dom.projectNameInput.addEventListener(`input`, (event) => {

        project.name = event.target.value;
        dom.projectNameLabel.textContent = project.name;
        document.title = project.name;
        saveProject();

    });

    dom.exportButton.addEventListener(`click`, () => {

        renderExport();
        dom.exportDialog.showModal();

    });
    dom.closeDialogButton.addEventListener(`click`, () => dom.exportDialog.close());
    dom.copyButton.addEventListener(`click`, copyExport);
    dom.downloadButton.addEventListener(`click`, downloadExport);
    const tabs = dom.exportTabs.getElementsByTagName(`button`);
    for( let index = 0; index < tabs.length; index++ ) {

        tabs[index].addEventListener(`click`, () => {

            exportFormat = tabs[index].dataset.f;
            renderExport();

        });

    }

    bindPanelEvents(`left`);
    bindPanelEvents(`right`);

    document.addEventListener(`keydown`, handlePanelShortcut);

};

/** Ponto de entrada: só roda com o DOM construído. */
const init = () => {

    cacheElements();
    loadPanelState();
    applyPanelState(`left`);
    applyPanelState(`right`);
    loadProject();
    bindEvents();
    dom.projectNameLabel.textContent = project.name;
    dom.savedLabel.textContent = `Salvo neste navegador`;
    document.title = project.name;
    applyPan();
    showHome();

};

if( document.readyState === `loading` ) {

    document.addEventListener(`DOMContentLoaded`, init);

}
else {

    init();

}