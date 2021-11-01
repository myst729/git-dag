void function () {
  const nodeStyle = {
    commit: '#c2e812',
    tree: '#91f5ad',
    blob: '#cb9cf2',
    tag: '#ffbe0b',
    branch: '#f865b0',
  }

  const buildLegends = () => {
    const p = document.createElement('p')
    p.className = 'legends'
    Object.entries(nodeStyle).forEach(([k, v]) => {
      const span = document.createElement('span')
      span.style.backgroundColor = v
      span.textContent = k
      p.appendChild(span)
    })
    document.getElementById('toolbar').appendChild(p)
  }

  const checkScope = () => {
    const scoped = /(^\?|&)commits(=|$)/.test(location.search)
    const cb = document.getElementById('scope')
    cb.checked = scoped
    cb.addEventListener('change', e => {
      setTimeout(() => {
        const { origin, pathname } = location
        location.href = `${origin}${pathname}${e.target.checked ? '?commits=1' : ''}`
      }, 100)
    }, false)
  }

  const drawDag = async () => {
    const data = await fetchData()
    const dagData = formatDagData(data)

    if (drawDag.oldData !== dagData) {
      const cy = cytoscape({
        container: document.getElementById('cy'),
        layout: {
          name: 'elk',
          padding: 10,
          elk: {
            algorithm: 'layered'
          }
        },
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
          {
            selector: 'edge',
            style: {
              'background-color': 'black',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 0.66,
            },
          },
          {
            selector: 'edge[label]',
            style: {
              'label': 'data(label)',
              'color': '#333',
              'font-size': '10px',
            }
          },
          {
            selector: 'node',
            style: {
              'shape': 'round-rectangle',
              'content': 'data(name)',
              'color': '#333',
              'font-size': '10px',
              'text-valign': 'center',
              'height': '22px',
              'width': '50px',
              'border-width': '1px',
              'border-style': 'solid',
              'border-color': '#000',
              'border-opacity': '0.5',
            },
          },
          {
            selector: 'node[type="commit"]',
            style: {
              'background-color': nodeStyle.commit,
            },
          },
          {
            selector: 'node[type="tree"]',
            style: {
              'background-color': nodeStyle.tree,
            },
          },
          {
            selector: 'node[type="blob"]',
            style: {
              'background-color': nodeStyle.blob,
            },
          },
          {
            selector: 'node[type="tag"]',
            style: {
              'background-color': nodeStyle.tag,
            },
          },
          {
            selector: 'node[type="tag-ref"]',
            style: {
              'background-color': nodeStyle.tag,
              'border-width': '0px',
              'opacity': 0.75
            },
          },
          {
            selector: 'node[type="branch-ref"]',
            style: {
              'background-color': nodeStyle.branch,
              'border-width': '0px',
              'opacity': 0.75
            },
          },
        ],
        elements: dagData
      })
    }
  }

  const fetchData = async () => {
    const scoped = document.getElementById('scope').checked
    const api = `/dag${scoped ? '?scoped=1' : ''}`
    const res = await fetch(api)
    const data = await res.json()
    return data
  }

  const formatDagData = (data) => {
    const nodes = data.nodes.map(({ value: id, label: name, type }) => ({ data: { id, name, type } }))
    const edges = data.edges.map(edge => ({ data: edge }))
    return { nodes, edges }
  }

  buildLegends()
  checkScope()
  drawDag()

}()
