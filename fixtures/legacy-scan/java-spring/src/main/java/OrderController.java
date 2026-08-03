package com.example.orders;

import org.springframework.web.bind.annotation.*;

@RestController
public class OrderController {
  private final ApplicationEventPublisher events;

  @PostMapping("/orders")
  public Order createOrder() {
    events.publishEvent(new OrderCreated());
    return new Order();
  }
}

@Entity
class Order {
  String id;
}
