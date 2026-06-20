export interface ModelSelectorLike {
  id: string;
  providerId?: string;
  modelId?: string;
  selector?: string;
}

export function getModelSelector(model: ModelSelectorLike): string {
  if (model.selector && model.selector.trim()) {
    return model.selector.trim();
  }
  if (model.providerId && model.modelId) {
    return `${model.providerId}/${model.modelId}`;
  }
  return model.id;
}

export function getModelDisplayId(model: ModelSelectorLike): string {
  return model.selector || model.modelId || model.id;
}

export function resolveModelSelector(models: ModelSelectorLike[], value?: string): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();
  const matched = models.find((model) => {
    const selector = getModelSelector(model);
    return selector === normalized || model.id === normalized || model.modelId === normalized;
  });

  return matched ? getModelSelector(matched) : normalized;
}
