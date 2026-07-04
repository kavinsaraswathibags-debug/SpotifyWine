import { Directive, ElementRef, OnInit, OnDestroy, Input } from '@angular/core';

@Directive({
  selector: '[appScrollAnimate]',
  standalone: true
})
export class ScrollAnimateDirective implements OnInit, OnDestroy {
  @Input('appScrollAnimate') animationClass: string = 'fade-in-up';
  @Input() staggerDelay: number = 60; // stagger delay in ms

  private static observer: IntersectionObserver | null = null;
  private static staggerQueue: { el: HTMLElement; delay: number }[] = [];
  private static queueTimeout: any = null;

  constructor(private el: ElementRef) {}

  ngOnInit() {
    const element = this.el.nativeElement;
    
    // Add base classes for scroll animations
    element.classList.add('scroll-reveal-base', this.animationClass);
    element.setAttribute('stagger-delay', this.staggerDelay.toString());
    
    this.initObserver();
    ScrollAnimateDirective.observer?.observe(element);
  }

  ngOnDestroy() {
    ScrollAnimateDirective.observer?.unobserve(this.el.nativeElement);
  }

  private initObserver() {
    if (ScrollAnimateDirective.observer) return;

    ScrollAnimateDirective.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (element.classList.contains('animate-in')) return;

          // Read the stagger-delay attribute
          const delay = parseInt(element.getAttribute('stagger-delay') || '60', 10);

          ScrollAnimateDirective.staggerQueue.push({ el: element, delay });
          ScrollAnimateDirective.processQueue();
        } else {
          // Remove 'animate-in' when it goes out of view so it can animate in again on re-entry
          element.classList.remove('animate-in');
          // Remove from queue if it went out of view before animating
          ScrollAnimateDirective.staggerQueue = ScrollAnimateDirective.staggerQueue.filter(item => item.el !== element);
        }
      });
    }, {
      threshold: 0.01, // triggers as soon as 1% of the element is visible
      rootMargin: '10px 0px -10px 0px' // offset to trigger slightly before screen bounds
    });
  }

  private static processQueue() {
    if (ScrollAnimateDirective.queueTimeout) return;

    const processNext = () => {
      if (ScrollAnimateDirective.staggerQueue.length === 0) {
        ScrollAnimateDirective.queueTimeout = null;
        return;
      }

      const item = ScrollAnimateDirective.staggerQueue.shift();
      if (item) {
        item.el.classList.add('animate-in');
        ScrollAnimateDirective.queueTimeout = setTimeout(processNext, item.delay);
      }
    };

    processNext();
  }
}
