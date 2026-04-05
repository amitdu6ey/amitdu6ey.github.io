# Sample Experiment: Two Sum - Hash Map vs Brute Force

## Objective

Compare the performance of a hash map approach vs brute force for the classic Two Sum problem.

## Hypothesis

The hash map approach should achieve O(n) time complexity compared to O(n^2) for brute force, showing significant improvement for large inputs.

## Setup

- Language: Java 11
- Input sizes: 1K, 10K, 100K, 1M elements
- Each test averaged over 100 runs

## Code

```java
// Brute Force - O(n^2)
public int[] twoSumBruteForce(int[] nums, int target) {
    for (int i = 0; i < nums.length; i++) {
        for (int j = i + 1; j < nums.length; j++) {
            if (nums[i] + nums[j] == target) {
                return new int[]{i, j};
            }
        }
    }
    return new int[]{};
}

// Hash Map - O(n)
public int[] twoSumHashMap(int[] nums, int target) {
    Map<Integer, Integer> map = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (map.containsKey(complement)) {
            return new int[]{map.get(complement), i};
        }
        map.put(nums[i], i);
    }
    return new int[]{};
}
```

## Results

| Input Size | Brute Force (ms) | Hash Map (ms) | Speedup |
|-----------|------------------|---------------|---------|
| 1K        | 2                | 1             | 2x      |
| 10K       | 45               | 2             | 22x     |
| 100K      | 4,200            | 8             | 525x    |
| 1M        | timeout          | 35            | -       |

## Conclusion

The hash map approach scales linearly as expected, while brute force becomes impractical beyond 100K elements.

---

[Back to Experiments](../index.md)
