目前平台localStorage/indexdDB存储量太大，导致了客户浏览器中localStorage/indexdDB超限，导致异常case，需要解决。基于这个思想，帮我封装一个基于LRU置换算法的浏览器缓存清理算法，同时支持indexDB和localStorage。

解决方案：基于置换算法实现自动清理机制（不经常访问的storage的key可以认为过期/无效的key，可以清理掉，释放空间）

- 默认内置LRU置换算法，也支持其他算法（抽象interface）
- 支持localStorage，也支持indexDB等（抽象interface）

技术方案

1. proxy 代理storage的get/set操作，每次get的时候执行LRU缓存置换策略。（需要调研可行性，可以做到业务无感知）。缓存策略所需变量存到localStorage中，存储其他storage的key-value使用频次相关数据（尽可能压缩、编码，占据storage的体积需要在可控范围内）
使用TS封装一个SDK，设计API，完成功能开发和测试demo
注意：
1. LRU算法是内置的，但是暴露算法接口，可以支持外部控制清理策略。算法和SDK解耦
2. 清理的时候，根据配置的清理最大容量，清理掉最近最少使用的key-value（可以约定多长时间没访问就自动清理，也可以将要到达指定容量并且新的setItem的时候清理，保证能插入新的。清理也要保证最少清理原则，能保证插入新数据成功即可）
3. API尽量简洁，无侵入性，业务代码无感知，基于proxy+Object.defineProperty 实现自动代理策略
- 使用Proxy监听localStorage的getItem和setItem方法
- 使用 Object.defineProperty(window, 'localStorage'), 替换全局的localStorage对象