---
date: '2025-08-03T19:18:45+07:00'
draft: false
title: 'String Simulation in C'
---

Simulating string is one of my favourite things that I have done. This is the first time I simulated something outside the context of tasks and directly from a physics book. The full explanation about the algorithm used is available in another blog titled [String Simulation](/blog/string-simulation). This blog will focus on the Runge-Kutta part.

The equation that is going to be simulated is this:

\[ \ddot{y_r} = \frac{T}{ma}(y_{r-1} - 2y_{r} + y_{r+1}) \]

I will be using [raylib](https://raylib.com) for visualization which has been on my to-do for a while.

In my previous Python implementation, I conveniently used SciPy which has a built-in initial value problem solver that can use [Runge-Kutta](https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods). I have implemented RK4 manually in [this project](https://github.com/Kylamber/BSSN-BBH-Simulation), but it was behind many convenient abstractions that Python and the other libraries served. This mini project would serve as a good starting point to learn and get used to C.

To start, I grabbed [this](https://www.raylib.com/examples/core/loader.html?name=core_3d_camera_free) 3D camera setup from raylib's examples: 

```c
#include "raylib.h"

int main(){
    // Raylib Init 
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "String Simulation in C");

    Camera3D camera = { 0 };
    camera.position = (Vector3){ 10.0f, 10.0f, 10.0f }; 
    camera.target = (Vector3){ 0.0f, 0.0f, 0.0f };      
    camera.up = (Vector3){ 0.0f, 1.0f, 0.0f };          
    camera.fovy = 45.0f;                                
    camera.projection = CAMERA_PERSPECTIVE;                 
    DisableCursor();                    

    int targetFPS = 60;
    SetTargetFPS(targetFPS);                   

    // String sim init

    // Place the cubes to visualize the masses
    int nCubes = 11;
    struct Vector3 cubes[nCubes];
    for (int i = 0; i < nCubes; i++){
        cubes[i].x = (float) i - 5.0f;
        cubes[i].y = 0.0f;
        cubes[i].z = 0.0f;
    }

    // We'll place both the y and v in the same array.
    float* result;
    result = calloc( nCubes*2, sizeof(float) );
    float* current;
    current = calloc( nCubes*2, sizeof(float) );

    // Main game loop
    while (!WindowShouldClose())        
    {
        UpdateCamera(&camera, CAMERA_FREE);

        BeginDrawing();
            ClearBackground(RAYWHITE);
            BeginMode3D(camera);
				
                // Draw the cubes
                for (int i = 0; i < nCubes; i++){
                    DrawCube(cubes[i], 0.5f, 0.5f, 0.5f, BLUE);
                    DrawCubeWires(cubes[i], 0.5f, 0.5f, 0.5f, BLACK);
                }

                DrawGrid(10, 1.0f);

            EndMode3D();
            // Benchmark performance
            DrawFPS(GetScreenWidth() - 220, 10);
        EndDrawing();
    }

    // De-Initialization
    free(current);
    free(result);
    CloseWindow();        

    return 0;
}

```

This code also sets us with a row of cubes to visualize the string masses.

Now we can move on to the math. Starting simple, from the [Euler Method](https://en.wikipedia.org/wiki/Euler_method), I would rewrite the equation as such:

\[ 
\begin{align*}
\frac{d}{dt} y & = v \\
\frac{d}{dt} v & = \frac{T}{ma}(y_{r-1} - 2y_{r} + y_{r+1}) \\
\end{align*}
\]

this way, we can know the difference between the current position/velocity and the next position/velocity is given by:

\[ 
\begin{align*}
dy & = v\,dt \\
dv & = \frac{T}{ma}(y_{r-1} - 2y_{r} + y_{r+1})\,dt \\
\end{align*}
\]

and the next position/velocity is given by:

\[
\begin{align*}
y_{t+1} & = y_{t} + dy \\
v_{t+1} & = v_{t} + dv \\
\end{align*}
\]

In C, it would look something like this:

```c
// dt is the simulation step,
// nDots is the number of mass on the string,
// y is an array of floats ordered as such: [y1, ydot1, y2, ydot2, ... yn, ydotn]
// same with result.

int evolveEuler(float dt, int nDots, float* result, float* y){
    float T = 1.0f;
    float m = 0.1f/(float)nDots;
    float a = 2.0f/(float)nDots;

    // Store our d/dts here
    float* dy;
    dy = calloc( nDots * 2, sizeof(float) );

    for (int i = 1; i < nDots * 2; i += 2){
        dy[i-1] = y[i];
    }

    for (int i = 3; i < (nDots * 2) - 1; i += 2){
        float term1 = y[i-3+0];
        float term2 = y[i-3+2];
        float term3 = y[i-3+4];
        dy[i] = T/(m*a) * (term1 - 2*term2 + term3);
    }

    dy[1] = 0;
    dy[(nDots*2)-1] = 0;

    // Update the position/velocity with the d/dts
    for (int i = 0; i < nDots; i++){
        result[2*i] = y[2*i] + (dy[2*i] * dt); 
        result[(2*i)+1] = y[(2*i)+1] + (dy[(2*i)+1] * dt); 
    }

    free(dy);
}
```

We would then update the cube's position and also the value of the current array to the results after `EndDrawing()`. 

```c
int main(){
    // ...
    EndDrawing()

    float dt = 1.0f/60.0f
    evolveEuler(dt, nCubes, result, current);
    for (int i = 0; i < nCubes; i++){
        cubes[i].y = result[i*2];

        current[i*2] = result[i*2];
        current[(2*i)+1] = result[(2*i)+1];
    }
    //...
}
```

We can then move on to Runge-Kutta. In the method, we have to compute these values

\[
\begin{align*}
k_1 & = f(t_n, y_n) \\
k_2 & = f(t_n + \frac{h}{2}, y_n + h \frac{k_1}{2}) \\
k_3 & = f(t_n + \frac{h}{2}, y_n + h \frac{k_2}{2}) \\
k_4 & = f(t_n + h, y_n + hk_3) \\
\end{align*}
\]

where \( \frac{dy}{dt} = f(t,y) \), \( y(t_0) = y_0 \), and \( h = dt \). After that, we can compute the next value using

\[
\begin{align*}
y_{n+1} & = y_n + \frac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4), \\
t_{n+1} & = t_n + h.
\end{align*}
\]

We can compute `k_1` the same as we did in the Euler Method. But for `k_2`, we would need to change the values of position/velocity used in the computation with \( y_n + h \frac{k_1}{2} \). Same goes with `k_3` and `k_4`.

```c
int evolveRK4(float dt, int nDots, float* result, float* y){
    // d^2/dt^2 y = -g
    // d/dt y = v

    float T = 1.0f;
    float m = 0.1f/(float)nDots;
    float a = 2.0f/(float)nDots;

    float* k1;
    k1 = calloc( nDots * 2, sizeof(float) );
    float* k2;
    k2 = calloc( nDots * 2, sizeof(float) );
    float* k3;
    k3 = calloc( nDots * 2, sizeof(float) );
    float* k4;
    k4 = calloc( nDots * 2, sizeof(float) );

    // k1 (same as the evolveEuler)
    for (int i = 1; i < nDots * 2; i += 2){
        k1[i-1] = y[i];
    }

    for (int i = 3; i < (nDots * 2) - 1; i += 2){
        float term1 = y[i-3+0];
        float term2 = y[i-3+2];
        float term3 = y[i-3+4];

        k1[i] = T/(m*a) * (term1 - 2*term2 + term3);// - 9.8f; // - 0.01/m*y[i];
    }

    k1[1] = 0;
    k1[(nDots*2)-1] = 0;

    // k2
    for (int i = 1; i < nDots * 2; i += 2){
        // The current velocity (y[i]) is added with dt/2 * k1
        k2[i-1] = y[i] + (0.5f * dt * k1[i]);
    }

    for (int i = 3; i < (nDots * 2) - 1; i += 2){
        // Same with the velocity, the positions (y[i-3+0], y[i-3+2], y[i-3+4]
        // are added with k1 to get the position at time t + dt/2
        float term1 = y[i-3+0] + 0.5f * dt * k1[i-3];
        float term2 = y[i-3+2] + 0.5f * dt * k1[i-3+2];
        float term3 = y[i-3+4] + 0.5f * dt * k1[i-3+4];

        k2[i] = T/(m*a) * (term1 - 2*term2 + term3);// - 9.8f; // - 0.01/m*y[i];
    }

    k2[1] = 0;
    k2[(nDots*2)-1] = 0;

    // k3
    for (int i = 1; i < nDots * 2; i += 2){
        k3[i-1] = y[i] + (0.5f * dt * k3[i]);
    }


    for (int i = 3; i < (nDots * 2) - 1; i += 2){
        float term1 = y[i-3+0] + 0.5f * dt * k2[i-3];
        float term2 = y[i-3+2] + 0.5f * dt * k2[i-3+2];
        float term3 = y[i-3+4] + 0.5f * dt * k2[i-3+4];

        k3[i] = T/(m*a) * (term1 - 2*term2 + term3);// - 9.8f; // - 0.01/m*y[i];
    }

    k3[1] = 0;
    k3[(nDots*2)-1] = 0;

    // k4
    for (int i = 1; i < nDots * 2; i += 2){
        k4[i-1] = y[i] + (dt * k3[i]);
    }

    for (int i = 3; i < (nDots * 2) - 1; i += 2){	
        float term1 = y[i-3+0] + dt * k3[i-3];
        float term2 = y[i-3+2] + dt * k3[i-3+2];
        float term3 = y[i-3+4] + dt * k3[i-3+4];

        k4[i] = T/(m*a) * (term1 - 2*term2 + term3); // - 9.8f; // - 0.01/m*y[i];
    }

    k4[1] = 0;
    k4[(nDots*2)-1] = 0;

    // result
    for (int i = 0; i < nDots; i++) {
        result[i*2] = y[i*2] + ( dt/6.0f * (
            k1[i*2] 
            + 2 * k2[i*2] 
            + 2 * k3[i*2]
            + k4[i*2] ) ); 	

        int j = (2*i)+1;
        result[j] = y[j] + ( dt/6.0f * (
            k1[j] 
            + 2 * k2[j] 
            + 2 * k3[j]
            + k4[j] ) ); 	
    }

    free(k1);
    free(k2);
    free(k3);
    free(k4);

    return 0;
}
```

Replace `evolveEuler` with `evolveRK4` and we get a more stable string sim. I have also put gravity and damping inside the comment that can be enabled. But, the current implementation is still not perfect.

```c
float dt = 1.0f/60.0f;
evolveRK4(dt, nCubes, result, current);
for (int i = 0; i < nCubes; i++){
    cubes[i].y = result[i*2];

    current[i*2] = result[i*2];
    current[(2*i)+1] = result[(2*i)+1];
}
```

With this code, if we set dt lower, the simulation will be more precise but it will also play in slow motion. To mitigate this issue, we'll perform the calculation multiple times with a lower dt. 

```c
int slowDownFactor = 50;
for (int i = 0; i < slowDownFactor; i++){
    float dt = 1.0f/60.0f;
    evolveRK4(1.0f/60.0f/(float)slowDownFactor, nCubes, result, current);
    for (int i = 0; i < nCubes; i++){
        cubes[i].y = result[i*2];

        current[i*2] = result[i*2];
        current[(2*i)+1] = result[(2*i)+1];
    }
}
```

With my laptop rocking an AMD Ryzen 5 4600H, I could get the `slownDownFactor` up to 50000 where it drops to 40 FPS, which is very surprising because of the number of loops inside the loop. Maybe I was stuck in Python for too long and just now tasting the power of a compiled language.

Here's some result by setting `current[2] = 2.0f` at the initialization, increasing the number of cubes, and with damping.

{{< video src="/blog/string-simulation-in-c/result.mp4" >}}
