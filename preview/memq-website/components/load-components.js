// 动态加载导航栏和Footer组件
async function loadComponent(componentName) {
    try {
        // 加载HTML
        const htmlResponse = await fetch(`components/${componentName}.html`);
        if (!htmlResponse.ok) {
            throw new Error(`Failed to load ${componentName}.html`);
        }
        const html = await htmlResponse.text();
        
        // 加载CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = `components/${componentName}.css`;
        document.head.appendChild(cssLink);
        
        return html;
    } catch (error) {
        console.error(`Error loading component ${componentName}:`, error);
        return '';
    }
}

// 加载所有组件
async function loadComponents() {
    // 加载导航栏
    const navbarHtml = await loadComponent('navbar');
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder && navbarHtml) {
        navbarPlaceholder.innerHTML = navbarHtml;
    }
    
    // 加载Footer
    const footerHtml = await loadComponent('footer');
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder && footerHtml) {
        footerPlaceholder.innerHTML = footerHtml;
    }
    
    // 初始化平滑滚动（如果页面需要）
    initSmoothScrolling();
}

// 初始化平滑滚动功能
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// 页面加载完成后加载组件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadComponents);
} else {
    loadComponents();
}

