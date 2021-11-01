const fs = require('fs')
const path = require('path')
const simpleGit = require('simple-git')

const { readdir, readFile } = fs.promises
const git = simpleGit()

const readRefs = async (refType, refsPath, commitsOnly) => {
  try {
    const files = await readdir(refsPath, { withFileTypes: true })
    return Promise.all(files.map(async (file) => {
      if (file.isFile()) {
        const filePath = path.join(refsPath, file.name)
        const content = await readFile(filePath, { encoding: 'utf-8' })
        if (refType === 'tag' && commitsOnly) {
          const taggedType = await git.catFile(['-t', content.trim()])
          if (taggedType.trim() === 'tag') {
            const targetRE = /^object [a-z0-9]{40}$/
            const taggedContent = await git.catFile(['-p', content.trim()])
            const targetObject = taggedContent.trim().split('\n').find(row => targetRE.test(row))
            const shortHash = await git.revparse(['--short', content.trim()])
            return { name: file.name, hash: targetObject.replace(/^object /, ''), type: `${refType}-ref`, through: shortHash }
          }
        }
        return { name: file.name, hash: content.trim(), type: `${refType}-ref` }
      }
    }))
  } catch (err) {
    console.error(err)
  }
}

const readObjects = async (objectsPath) => {
  const isHashPrefixDir = (hashPrefix) => hashPrefix.isDirectory() && /^[a-z0-9]{2}$/.test(hashPrefix.name)
  try {
    const hashPrefixes = await readdir(objectsPath, { withFileTypes: true })
    return hashPrefixes.reduce(async (objects, hashPrefix) => {
      if (isHashPrefixDir(hashPrefix)) {
        const prevObjects = await objects
        const hashPrefixPath = path.join(objectsPath, hashPrefix.name)
        const hashSuffixes = await readdir(hashPrefixPath, { withFileTypes: true })
        const newObjects = await Promise.all(hashSuffixes.map(async (hashSuffix) => {
          if (hashSuffix.isFile()) {
            const fullHash = `${hashPrefix.name}${hashSuffix.name}`
            const shortHash = await git.revparse(['--short', fullHash])
            const objectType = await git.catFile(['-t', fullHash])
            return { hash: fullHash, short: shortHash, type: objectType.trim() }
          }
        }))
        return [...prevObjects, ...newObjects]
      }
      return objects
    }, Promise.resolve([]))
  } catch (err) {
    console.error(err)
  }
}

const buildDagData = async (objects, branches, tags, commitsOnly) => {
  try {
    const refsData = [...branches, ...tags].reduce((data, ref) => {
      const { nodes, edges } = data
      const { name, hash, type, through } = ref
      const newNode = { value: name, label: name, type }
      const newEdge = { source: name, target: hash, label: through }
      return { nodes: [...nodes, newNode], edges: [...edges, newEdge] }
    }, { nodes: [], edges: [] })

    const scope = commitsOnly ? objects.filter(obj => obj.type === 'commit') : objects
    return scope.reduce(async (dagInfo, obj) => {
      const { nodes, edges } = await dagInfo
      const { hash: fullHash, short: shortHash, type: objType } = obj
      const newNode = { value: fullHash, label: shortHash, type: objType }

      if (objType === 'commit') {
        const targetRE = commitsOnly ? /^parent [a-z0-9]{40}$/ : /^(tree|parent) [a-z0-9]{40}$/
        const objectContent = await git.catFile(['-p', fullHash])
        const treesOrParents = objectContent.trim().split('\n').filter(row => targetRE.test(row))
        const newEdges = await Promise.all(treesOrParents.map(async (row) => {
          const toHash = row.replace(/^(tree|parent) /, '')
          return { source: fullHash, target: toHash }
        }))
        return { nodes: [...nodes, newNode], edges: [...edges, ...newEdges] }
      }

      if (objType === 'tree') {
        const objectContent = await git.catFile(['-p', fullHash])
        const treesOrBlobs = objectContent.trim().split('\n').filter(row => /^\d{6} (tree|blob) [a-z0-9]{40}\s/.test(row))
        const newEdges = await Promise.all(treesOrBlobs.map(async (row) => {
          const toHash = row.replace(/^\d{6} (tree|blob) /, '').slice(0, 40)
          return { source: fullHash, target: toHash }
        }))
        return { nodes: [...nodes, newNode], edges: [...edges, ...newEdges] }
      }

      if (objType === 'blob') {
        return { nodes: [...nodes, newNode], edges }
      }

      if (objType === 'tag') {
        const targetRE = /^object [a-z0-9]{40}$/
        const objectContent = await git.catFile(['-p', fullHash])
        const targetObject = objectContent.trim().split('\n').filter(row => targetRE.test(row))
        const newEdges = await Promise.all(targetObject.map(async (row) => {
          const toHash = row.replace(/^object /, '')
          return { source: fullHash, target: toHash }
        }))
        return { nodes: [...nodes, newNode], edges: [...edges, ...newEdges] }
      }

    }, Promise.resolve(refsData))
  } catch (err) {
    console.error(err)
  }
}

const gitDag = async (dotGitRoot, commitsOnly) => {
  const [branches, tags, objects] = await Promise.all([
    readRefs('branch', path.join(dotGitRoot, 'refs/heads')),
    readRefs('tag', path.join(dotGitRoot, 'refs/tags'), commitsOnly),
    readObjects(path.join(dotGitRoot, 'objects'))
  ])
  const dagData = await buildDagData(objects, branches, tags, commitsOnly)
  return dagData
}

module.exports = gitDag
