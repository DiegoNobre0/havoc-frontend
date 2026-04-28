import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetalhesAtendimento } from './detalhes-atendimento';

describe('DetalhesAtendimento', () => {
  let component: DetalhesAtendimento;
  let fixture: ComponentFixture<DetalhesAtendimento>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetalhesAtendimento]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetalhesAtendimento);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
